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

// `@aws-sdk/client-s3` is loaded lazily via `getAwsSdk()` because
// `@aws-sdk/core` ships an ESM index that does
// `import './emitWarningIfUnsupportedVersion'` without the `.js`
// extension. Node ESM (and the Vitest SSR loader) reject that import
// at module-eval time. Rolldown bundles the SDK in `npm run build` so
// production never sees it, but the lazy getter ensures test files
// that transitively touch this module don't crash on import — the
// AWS SDK is only evaluated when a function actually calls `getAwsSdk()`.

const log = getLogger('storage.s3')

// --- Lazy AWS SDK loader ---

type AwsSdk = typeof import('@aws-sdk/client-s3')
type S3ClientInstance = InstanceType<AwsSdk['S3Client']>

let awsSdk: AwsSdk | undefined

async function getAwsSdk(): Promise<AwsSdk> {
  if (awsSdk === undefined) {
    awsSdk = await import('@aws-sdk/client-s3')
  }
  return awsSdk
}

// --- Client cache ---

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

// --- Context resolver ---

interface S3StorageContext {
  client: S3ClientInstance
  bucket: string
}

/**
 * Resolve the live S3 client + bucket name for the current operation.
 * Throws `ActionFailure(503)` when the upload toggle is OFF (unless
 * `requireEnabled: false` — reads/deletes/existence checks on historical
 * S3 objects must keep working after the toggle is flipped off) or when
 * the credentials are half-configured. Module-private: the only way in
 * from outside is the `StorageBackend` contract below.
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
  if (cached !== undefined && cached.fingerprint === fingerprint) {
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
    // Some S3-compatible services return base64-encoded Content-MD5 while
    // the AWS SDK v3 expects hex, causing a false "Checksum mismatch" on
    // GetObject. WHEN_REQUIRED skips automatic response validation unless
    // the caller explicitly asks for it (ChecksumMode: ENABLED).
    responseChecksumValidation: 'WHEN_REQUIRED' as const,
    // AWS SDK v3 (>= 3.729.0) defaults to computing request checksums for
    // every PutObject. For streams of unknown length (e.g. the gzipped
    // database backup) the checksum middleware sets `x-amz-decoded-content-length`
    // to `undefined`, which Node rejects with "Invalid value undefined for
    // header x-amz-decoded-content-length" and surfaces as "An error was
    // encountered in a non-retryable streaming request." WHEN_REQUIRED keeps
    // checksums off unless the caller explicitly opts in.
    //
    // Note: this setting applies to every S3 upload (images, music, backups).
    // Callers that upload known-length Buffers and want request integrity must
    // pass `ChecksumAlgorithm` on the individual command.
    requestChecksumCalculation: 'WHEN_REQUIRED' as const,
  }
  const client = new sdk.S3Client(config)
  installDeleteObjectsMd5Fallback(sdk, client)
  s3CachedClient = { fingerprint, client }
  return { client, bucket: storage.bucket }
}

// AWS SDK v3 (>= 3.729.0) defaults to CRC32 for `DeleteObjects`. Several
// S3-compatible providers (Backblaze B2, MinIO older builds, some Aliyun
// OSS configurations, Cloudflare R2 in certain regions) reject those
// requests with `ErrMissingContentMD5` because they only honor the legacy
// `Content-MD5` header for that one operation. The documented fallback
// (https://github.com/aws/aws-sdk-js-v3/blob/main/supplemental-docs/MD5_FALLBACK.md)
// is to install a middleware AFTER `flexibleChecksumsMiddleware` that
// strips the modern checksum headers and replaces them with `Content-MD5`.
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

// --- Operations ---

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

/**
 * The SDK's not-found vocabulary, normalized into one predicate:
 * `NoSuchKey` (XML-error S3 services on `GetObject`), `NotFound`
 * (`HeadObject`), or a bare 404 from S3-compatible providers that don't
 * set an error name.
 */
function isS3NotFoundError(error: unknown): boolean {
  const name = unsafeCast<{ name?: string }>(error).name
  const statusCode = unsafeCast<{ $metadata?: { httpStatusCode?: number } }>(error).$metadata?.httpStatusCode
  return name === 'NoSuchKey' || name === 'NotFound' || statusCode === 404
}

/**
 * Existence check via a single `HeadObject`. Cheaper and more precise than
 * the prior `listS3Objects(key, 1)` approach (one request, exact-key match
 * rather than a prefix listing the migration would otherwise fire for every
 * object). Treats a `404`/`NotFound` as "absent" and any other failure as
 * "absent" too — a transient error mid-migration shouldn't abort, since the
 * subsequent PUT is idempotent (matches the old list-based contract).
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

/**
 * `GetObject` with the seam's not-found normalization: an SDK `NoSuchKey` /
 * `NotFound` / bare-404 rejection becomes `StorageObjectNotFound`; any other
 * failure propagates unchanged.
 */
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
    // An empty body is indistinguishable from a miss for callers — surface
    // the seam's not-found either way.
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
 * Stream an object without buffering it into memory. Used for backups,
 * which can exceed the `MAX_OBJECT_BUFFER_SIZE` cap that buffered reads
 * enforce. Throws `StorageObjectNotFound` on a missing/empty object.
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

/**
 * S3-compatible backend. The lazy SDK loader, fingerprint-cached client,
 * MD5-delete fallback, and checksum workarounds all live above as
 * module-private code — the exported surface is exactly the
 * `StorageBackend` contract.
 */
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
    // Branding/backups are private-cache; images/music are public-cache.
    // The visibility → cache-control mapping lives here and nowhere else.
    const visibility = input.visibility ?? 'public'
    const cacheControl =
      input.cacheControl ?? (visibility === 'private' ? DEFAULT_PRIVATE_CACHE_CONTROL : DEFAULT_PUBLIC_CACHE_CONTROL)
    await putObject(input.key, input.body, input.contentType, cacheControl)
    return { key: input.key, size: input.body.length, lastModified: new Date() }
  },

  async putStream(input: PutStreamInput): Promise<StoredObjectMeta> {
    // Streamed bodies (backups) are private-cache, matching the buffered
    // private put. A Transform meter counts the bytes in flight — unlike a
    // 'data' listener it keeps backpressure intact — so the returned size
    // is the exact uploaded byte count (the backup row's byteSize doubles
    // as the download's Content-Length, where a guess would corrupt it).
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
    // One `HeadObject` request with an exact-key match, rather than a
    // prefix listing. A failure (e.g. S3 misconfigured mid-migration) is
    // treated as "not present" — the subsequent PUT is idempotent and
    // overwrites, so this is safe.
    return objectExists(key)
  },

  async delete(key: string): Promise<void> {
    await deleteObject(key)
  },

  async deleteMany(keys: string[]): Promise<void> {
    await deleteObjects(keys)
  },

  async deletePrefix(prefix: string): Promise<void> {
    // S3 has no real directories — deleting all objects under the prefix
    // effectively removes the "folder". List and delete in pages to handle
    // prefixes with more than 1000 objects.
    const objects = await listObjects(prefix)
    if (objects.length > 0) {
      await deleteObjects(objects.map((o) => o.key))
    }
    // S3-compatible services that persist folder markers (MinIO, SeaweedFS,
    // Aliyun OSS, …) leave a zero-byte object at the prefix itself after the
    // contents are gone. The contract is "including the prefix directory
    // itself", so best-effort delete it — a missing marker is not an error.
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

// `buildPublicUrl` lives in `@/server/domains/images/services/cache` and
// resolves the live `publicBaseUrl` directly through
// `@/server/infra/storage/public-url`'s `resolveAssetUrl`. Keeping it out
// of this module is what allows the SSR enhancer to stay free of the AWS
// SDK in code paths that only need to compute a URL (no PUT/DELETE).
