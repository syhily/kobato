import type { GetObjectCommandOutput, ServiceInputTypes, ServiceOutputTypes, _Object } from '@aws-sdk/client-s3'
import type { FinalizeRequestMiddleware, HandlerExecutionContext } from '@smithy/types'

import { createHash } from 'node:crypto'
import { Readable, Transform } from 'node:stream'

import type { PutObjectInput, PutStreamInput, StorageBackend, StoredObjectMeta } from '@/server/infra/storage/backend'
import type { AssetsSettings } from '@/shared/config/types'

import { ActionFailure } from '@/server/infra/http/errors'
import { getLogger } from '@/server/infra/logger'
import {
  DEFAULT_PRIVATE_CACHE_CONTROL,
  DEFAULT_PUBLIC_CACHE_CONTROL,
  MAX_OBJECT_BUFFER_SIZE,
  StorageObjectNotFound,
} from '@/server/infra/storage/backend'
import { requireBlogSettingsSection } from '@/shared/config/getters'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

// The SDK is loaded lazily via `getAwsSdk()`: `@aws-sdk/core`'s ESM index
// imports a file without a `.js` extension, which Node ESM and the Vitest
// SSR loader reject at module-eval time.

const log = getLogger('storage.s3')

type AwsSdk = typeof import('@aws-sdk/client-s3')
type S3ClientInstance = InstanceType<AwsSdk['S3Client']>

let awsSdk: AwsSdk | undefined

async function getAwsSdk(): Promise<AwsSdk> {
  if (awsSdk === undefined) {
    awsSdk = await import('@aws-sdk/client-s3')
  }
  return awsSdk
}

interface CachedClient {
  fingerprint: string
  client: S3ClientInstance
}

let s3CachedClient: CachedClient | undefined

function fingerprintFor(storage: AssetsSettings['storage']): string {
  return JSON.stringify({
    endpoint: storage.endpoint,
    region: storage.region,
    bucket: storage.bucket,
    accessKeyId: storage.accessKeyId,
    forcePathStyle: storage.forcePathStyle,
    secretFingerprint: storage.secretAccessKey === '' ? '<empty>' : 'present',
  })
}

interface S3StorageContext {
  client: S3ClientInstance
  bucket: string
}

/**
 * Resolve the live S3 client + bucket. Throws 503 when uploads are disabled
 * (unless `requireEnabled: false`) or credentials are half-configured.
 */
async function resolveS3Context(options?: { requireEnabled?: boolean }): Promise<S3StorageContext> {
  const settings = requireBlogSettingsSection('assets')
  const storage = settings.storage
  if (options?.requireEnabled !== false && !storage.enabled) {
    throw new ActionFailure(503, '图片上传未开启；请到 /admin/settings/assets 打开「启用 S3 上传」')
  }
  if ((storage.secretAccessKey ?? '') === '') {
    throw new ActionFailure(503, '请先在 /admin/settings/assets 配置 S3 凭据')
  }

  const fingerprint = fingerprintFor(storage)
  const cached = s3CachedClient
  if (cached?.fingerprint === fingerprint) {
    return { client: cached.client, bucket: storage.bucket }
  }

  if (cached !== undefined) {
    try {
      cached.client.destroy()
    } catch (error) {
      log.warn('Failed to destroy stale S3 client', { error })
    }
  }

  const sdk = await getAwsSdk()

  const config = {
    endpoint: storage.endpoint,
    region: storage.region,
    forcePathStyle: storage.forcePathStyle,
    credentials: {
      accessKeyId: storage.accessKeyId,
      secretAccessKey: storage.secretAccessKey ?? '',
    },
    // Some S3-compatible services return base64 Content-MD5 (SDK expects hex) — WHEN_REQUIRED skips validation unless asked.
    responseChecksumValidation: 'WHEN_REQUIRED' as const,
    // SDK v3 defaults to request checksums, which fail on unknown-length streams —
    // WHEN_REQUIRED keeps them off; callers wanting integrity pass `ChecksumAlgorithm`.
    //
    requestChecksumCalculation: 'WHEN_REQUIRED' as const,
  }
  const client = new sdk.S3Client(config)
  installDeleteObjectsMd5Fallback(sdk, client)
  s3CachedClient = { fingerprint, client }
  return { client, bucket: storage.bucket }
}

// SDK v3 sends CRC32 checksums on `DeleteObjects`, which several S3-compatible
// providers reject (`ErrMissingContentMD5`) — they only honor `Content-MD5` for
// this operation. This middleware strips the modern checksums and sets `Content-MD5`.
function installDeleteObjectsMd5Fallback(_sdk: AwsSdk, client: S3ClientInstance): void {
  const middleware: FinalizeRequestMiddleware<ServiceInputTypes, ServiceOutputTypes> =
    (next, context: HandlerExecutionContext) => async (args) => {
      if (context.commandName !== 'DeleteObjectsCommand') {
        return next(args)
      }
      const request = unsafeCast<{ headers: Record<string, string>; body?: unknown }>(args.request)
      for (const header of Object.keys(request.headers)) {
        const lower = header.toLowerCase()
        if (lower.startsWith('x-amz-checksum-') || lower.startsWith('x-amz-sdk-checksum-')) {
          delete request.headers[header]
        }
      }
      if (request.body !== undefined && request.body !== null) {
        const body = Buffer.from(unsafeCast<string | Uint8Array>(request.body))
        request.headers['Content-MD5'] = createHash('md5').update(body).digest('base64')
      }
      return next(args)
    }
  client.middlewareStack.addRelativeTo(middleware, {
    relation: 'before',
    toMiddleware: 'httpSigningMiddleware',
    name: 'addMD5ChecksumForDeleteObjects',
    tags: ['MD5_FALLBACK'],
  })
}

async function putObject(
  key: string,
  body: Buffer | Readable,
  contentType: string,
  cacheControl: string,
): Promise<void> {
  const sdk = await getAwsSdk()
  const { client, bucket } = await resolveS3Context()
  await client.send(
    new sdk.PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: cacheControl,
    }),
  )
}

function parseS3Contents(contents: _Object[] | undefined): StoredObjectMeta[] {
  const objects: StoredObjectMeta[] = []
  for (const item of contents ?? []) {
    if (item.Key && item.LastModified && item.Size !== undefined) {
      objects.push({ key: item.Key, size: item.Size, lastModified: item.LastModified })
    }
  }
  return objects
}

/** Normalized not-found predicate: `NoSuchKey`, `NotFound`, or a bare 404. */
function isS3NotFoundError(error: unknown): boolean {
  const name = unsafeCast<{ name?: string }>(error).name
  const statusCode = unsafeCast<{ $metadata?: { httpStatusCode?: number } }>(error).$metadata?.httpStatusCode
  return name === 'NoSuchKey' || name === 'NotFound' || statusCode === 404
}

/**
 * `HeadObject` existence check. Any failure — 404 or transient — counts as
 * "absent": the subsequent PUT is idempotent, so a mid-migration blip is safe.
 */
async function objectExists(key: string): Promise<boolean> {
  const sdk = await getAwsSdk()
  const { client, bucket } = await resolveS3Context({ requireEnabled: false })
  try {
    await client.send(new sdk.HeadObjectCommand({ Bucket: bucket, Key: key }))
    return true
  } catch (error) {
    if (isS3NotFoundError(error)) {
      return false
    }
    log.warn('HeadObject failed; treating key as absent', { key, error: String(error) })
    return false
  }
}

async function listObjects(prefix: string, maxKeys = 10_000): Promise<StoredObjectMeta[]> {
  const sdk = await getAwsSdk()
  const { client, bucket } = await resolveS3Context({ requireEnabled: false })
  const objects: StoredObjectMeta[] = []
  let continuationToken: string | undefined
  do {
    const response = await client.send(
      new sdk.ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    )
    objects.push(...parseS3Contents(response.Contents))
    continuationToken = response.NextContinuationToken
    if (objects.length > maxKeys) {
      log.warn('listObjects exceeded maxKeys; pagination aborted', {
        prefix,
        maxKeys,
        returned: objects.length,
      })
      break
    }
  } while (continuationToken)
  return objects
}

/** `GetObject` with not-found normalization; any other failure propagates unchanged. */
async function sendGetObject(
  sdk: AwsSdk,
  client: S3ClientInstance,
  bucket: string,
  key: string,
): Promise<GetObjectCommandOutput> {
  try {
    return await client.send(new sdk.GetObjectCommand({ Bucket: bucket, Key: key }))
  } catch (error) {
    throw isS3NotFoundError(error) ? new StorageObjectNotFound(key) : error
  }
}

async function getObjectBuffer(key: string, maxSize = MAX_OBJECT_BUFFER_SIZE): Promise<Buffer> {
  const sdk = await getAwsSdk()
  const { client, bucket } = await resolveS3Context({ requireEnabled: false })
  const response = await sendGetObject(sdk, client, bucket, key)
  if (response.Body === undefined) {
    // An empty body is indistinguishable from a miss — surface the seam's not-found.
    throw new StorageObjectNotFound(key)
  }
  const contentLength = response.ContentLength
  if (contentLength !== undefined && contentLength > maxSize) {
    throw new ActionFailure(413, `S3 对象过大 (${contentLength} 字节)，超出 ${maxSize} 字节限制`)
  }
  const stream = unsafeCast<Readable>(response.Body)
  const chunks: Buffer[] = []
  let received = 0
  return new Promise((resolve, reject) => {
    stream.on('data', (chunk: Buffer) => {
      received += chunk.length
      if (received > maxSize) {
        stream.destroy()
        reject(new ActionFailure(413, `S3 对象流超出 ${maxSize} 字节限制`))
        return
      }
      chunks.push(chunk)
    })
    stream.on('end', () => resolve(Buffer.concat(chunks)))
    stream.on('error', (err: Error) => reject(err))
  })
}

/**
 * Stream an object without buffering (backups exceed the buffered-read cap).
 * Throws `StorageObjectNotFound` on a missing/empty object.
 */
async function getObjectStream(key: string): Promise<Readable> {
  const sdk = await getAwsSdk()
  const { client, bucket } = await resolveS3Context({ requireEnabled: false })
  const response = await sendGetObject(sdk, client, bucket, key)
  if (response.Body === undefined) {
    throw new StorageObjectNotFound(key)
  }
  return unsafeCast<Readable>(response.Body)
}

async function deleteObject(key: string): Promise<void> {
  const sdk = await getAwsSdk()
  const { client, bucket } = await resolveS3Context({ requireEnabled: false })
  await client.send(new sdk.DeleteObjectCommand({ Bucket: bucket, Key: key }))
}

async function deleteObjects(keys: string[]): Promise<void> {
  if (keys.length === 0) {
    return
  }
  const sdk = await getAwsSdk()
  const { client, bucket } = await resolveS3Context()
  await client.send(
    new sdk.DeleteObjectsCommand({
      Bucket: bucket,
      Delete: { Objects: keys.map((key) => ({ Key: key })) },
    }),
  )
}

function storageSettings() {
  return requireBlogSettingsSection('assets').storage
}

export const s3Backend: StorageBackend = {
  driver: 's3',

  isAvailable(): boolean {
    const s = storageSettings()
    return (
      s.enabled &&
      s.endpoint.trim() !== '' &&
      s.bucket.trim() !== '' &&
      s.accessKeyId.trim() !== '' &&
      (s.secretAccessKey ?? '').trim() !== ''
    )
  },

  async put(input: PutObjectInput): Promise<StoredObjectMeta> {
    // The visibility → cache-control mapping lives here and nowhere else.
    const visibility = input.visibility ?? 'public'
    const cacheControl =
      input.cacheControl ?? (visibility === 'private' ? DEFAULT_PRIVATE_CACHE_CONTROL : DEFAULT_PUBLIC_CACHE_CONTROL)
    await putObject(input.key, input.body, input.contentType, cacheControl)
    return { key: input.key, size: input.body.length, lastModified: new Date() }
  },

  async putStream(input: PutStreamInput): Promise<StoredObjectMeta> {
    // A Transform meter counts bytes (backpressure-safe) — the exact size is the backup's Content-Length.
    let size = 0
    const meter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        size += chunk.length
        callback(null, chunk)
      },
    })
    await putObject(input.key, input.body.pipe(meter), input.contentType, DEFAULT_PRIVATE_CACHE_CONTROL)
    return { key: input.key, size, lastModified: new Date() }
  },

  async get(key: string): Promise<Buffer> {
    return getObjectBuffer(key)
  },

  async getStream(key: string): Promise<Readable> {
    return getObjectStream(key)
  },

  async exists(key: string): Promise<boolean> {
    return objectExists(key)
  },

  async delete(key: string): Promise<void> {
    await deleteObject(key)
  },

  async deleteMany(keys: string[]): Promise<void> {
    await deleteObjects(keys)
  },

  async deletePrefix(prefix: string): Promise<void> {
    // No real directories: delete every object under the prefix (paginated).
    const objects = await listObjects(prefix)
    if (objects.length > 0) {
      await deleteObjects(objects.map((o) => o.key))
    }
    // Some services persist a folder-marker object at the prefix — best-effort delete it (missing marker is not an error).
    if (prefix.endsWith('/')) {
      try {
        await deleteObject(prefix)
      } catch (error) {
        log.warn('Failed to delete prefix folder marker', { prefix, error })
      }
    }
  },

  async list(prefix: string, opts?: { maxKeys?: number }): Promise<StoredObjectMeta[]> {
    return listObjects(prefix, opts?.maxKeys)
  },
}

// URL resolution lives in `public-url.ts` so URL-only SSR paths never load the AWS SDK.
