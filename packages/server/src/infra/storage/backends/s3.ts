import type { GetObjectCommandOutput, ServiceInputTypes, ServiceOutputTypes, _Object } from '@aws-sdk/client-s3'
import type { ErrorMessageDescriptor } from '@kobato/contracts/api-error'
import type {
  PutObjectInput,
  PutStreamInput,
  StorageBackend,
  StoredObjectMeta,
  StreamWithMeta,
} from '@kobato/server/infra/storage/backend'
import type { AssetsSettings } from '@kobato/settings/types'
import type { FinalizeRequestMiddleware, HandlerExecutionContext } from '@smithy/types'

import { descriptorFor } from '@kobato/server/infra/http/error-descriptor'
import { ActionFailure } from '@kobato/server/infra/http/errors'
import { getLogger } from '@kobato/server/infra/logger'
import { MAX_OBJECT_BUFFER_SIZE, StorageObjectNotFound } from '@kobato/server/infra/storage/backend'
import { cacheControlForVisibility } from '@kobato/server/infra/storage/key-policy'
import { requireBlogSettingsSection } from '@kobato/settings/getters'
import { unsafeCast } from '@kobato/utils/unsafe-cast'
import { createHash } from 'node:crypto'
import { Readable, Transform } from 'node:stream'

// The SDK is loaded lazily via `getAwsSdk()`: `@aws-sdk/core`'s ESM index
// imports a file without a `.js` extension, which Node ESM and the Vitest
// SSR loader reject at module-eval time.

const log = getLogger('storage.s3')

type AwsSdk = typeof import('@aws-sdk/client-s3')
type S3ClientInstance = InstanceType<AwsSdk['S3Client']>

type S3StorageConfig = AssetsSettings['storage']

let awsSdk: AwsSdk | undefined

async function getAwsSdk(): Promise<AwsSdk> {
  if (awsSdk === undefined) {
    awsSdk = await import('@aws-sdk/client-s3')
  }
  return awsSdk
}

interface S3StorageContext {
  client: S3ClientInstance
  bucket: string
}

async function newS3Client(sdk: AwsSdk, storage: S3StorageConfig): Promise<S3ClientInstance> {
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
    requestChecksumCalculation: 'WHEN_REQUIRED' as const,
  }
  const client = new sdk.S3Client(config)
  installDeleteObjectsMd5Fallback(sdk, client)
  return client
}

interface CachedClient {
  fingerprint: string
  client: S3ClientInstance
}

let s3CachedClient: CachedClient | undefined

function fingerprintFor(storage: S3StorageConfig): string {
  return JSON.stringify({
    endpoint: storage.endpoint,
    region: storage.region,
    bucket: storage.bucket,
    accessKeyId: storage.accessKeyId,
    forcePathStyle: storage.forcePathStyle,
    secretFingerprint: storage.secretAccessKey === '' ? '<empty>' : 'present',
  })
}

async function resolveS3Context(options?: { requireEnabled?: boolean }): Promise<S3StorageContext> {
  const settings = requireBlogSettingsSection('assets')
  const storage = settings.storage
  if (options?.requireEnabled !== false && !storage.enabled) {
    throw new ActionFailure(503, descriptorFor('storage.error.disabled'))
  }
  if ((storage.secretAccessKey ?? '') === '') {
    throw new ActionFailure(503, descriptorFor('storage.error.credentialsMissing'))
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
  const client = await newS3Client(sdk, storage)
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
  ctx: S3StorageContext,
  key: string,
  body: Buffer | Readable,
  contentType: string,
  cacheControl: string,
): Promise<void> {
  const sdk = await getAwsSdk()
  await ctx.client.send(
    new sdk.PutObjectCommand({
      Bucket: ctx.bucket,
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

function isS3NotFoundError(error: unknown): boolean {
  const name = unsafeCast<{ name?: string }>(error).name
  const statusCode = unsafeCast<{ $metadata?: { httpStatusCode?: number } }>(error).$metadata?.httpStatusCode
  return name === 'NoSuchKey' || name === 'NotFound' || statusCode === 404
}

async function objectExists(ctx: S3StorageContext, key: string): Promise<boolean> {
  const sdk = await getAwsSdk()
  try {
    await ctx.client.send(new sdk.HeadObjectCommand({ Bucket: ctx.bucket, Key: key }))
    return true
  } catch (error) {
    if (isS3NotFoundError(error)) {
      return false
    }
    log.warn('HeadObject failed; treating key as absent', { key, error: String(error) })
    return false
  }
}

async function listObjects(
  ctx: S3StorageContext,
  prefix: string,
  opts?: { maxKeys?: number; startAfter?: string },
): Promise<StoredObjectMeta[]> {
  const sdk = await getAwsSdk()
  const maxKeys = opts?.maxKeys ?? 10_000
  const objects: StoredObjectMeta[] = []
  let continuationToken: string | undefined
  do {
    const response = await ctx.client.send(
      new sdk.ListObjectsV2Command({
        Bucket: ctx.bucket,
        Prefix: prefix,
        MaxKeys: Math.min(1000, maxKeys - objects.length),
        ContinuationToken: continuationToken,
        StartAfter: continuationToken === undefined ? opts?.startAfter : undefined,
      }),
    )
    objects.push(...parseS3Contents(response.Contents))
    continuationToken = response.NextContinuationToken
  } while (continuationToken && objects.length < maxKeys)
  return objects
}

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

async function getObjectBuffer(ctx: S3StorageContext, key: string, maxSize = MAX_OBJECT_BUFFER_SIZE): Promise<Buffer> {
  const sdk = await getAwsSdk()
  const response = await sendGetObject(sdk, ctx.client, ctx.bucket, key)
  if (response.Body === undefined) {
    throw new StorageObjectNotFound(key)
  }
  const contentLength = response.ContentLength
  if (contentLength !== undefined && contentLength > maxSize) {
    throw new ActionFailure(413, descriptorFor('storage.error.objectTooLarge', { size: contentLength, max: maxSize }))
  }
  const stream = unsafeCast<Readable>(response.Body)
  const chunks: Buffer[] = []
  let received = 0
  return new Promise((resolve, reject) => {
    stream.on('data', (chunk: Buffer) => {
      received += chunk.length
      if (received > maxSize) {
        stream.destroy()
        reject(new ActionFailure(413, descriptorFor('storage.error.objectStreamTooLarge', { max: maxSize })))
        return
      }
      chunks.push(chunk)
    })
    stream.on('end', () => resolve(Buffer.concat(chunks)))
    stream.on('error', (err: Error) => reject(err))
  })
}

async function getObjectStream(ctx: S3StorageContext, key: string): Promise<Readable> {
  const sdk = await getAwsSdk()
  const response = await sendGetObject(sdk, ctx.client, ctx.bucket, key)
  if (response.Body === undefined) {
    throw new StorageObjectNotFound(key)
  }
  return unsafeCast<Readable>(response.Body)
}

async function getObjectStreamWithMeta(ctx: S3StorageContext, key: string): Promise<StreamWithMeta> {
  const sdk = await getAwsSdk()
  const response = await sendGetObject(sdk, ctx.client, ctx.bucket, key)
  if (response.Body === undefined) {
    throw new StorageObjectNotFound(key)
  }
  return {
    body: unsafeCast<Readable>(response.Body),
    contentType: response.ContentType,
    cacheControl: response.CacheControl,
  }
}

async function deleteObject(ctx: S3StorageContext, key: string): Promise<void> {
  const sdk = await getAwsSdk()
  await ctx.client.send(new sdk.DeleteObjectCommand({ Bucket: ctx.bucket, Key: key }))
}

async function deleteObjects(ctx: S3StorageContext, keys: string[]): Promise<void> {
  if (keys.length === 0) {
    return
  }
  const sdk = await getAwsSdk()
  await ctx.client.send(
    new sdk.DeleteObjectsCommand({
      Bucket: ctx.bucket,
      Delete: { Objects: keys.map((key) => ({ Key: key })) },
    }),
  )
}

function isS3ConfigComplete(storage: S3StorageConfig): boolean {
  return (
    storage.endpoint.trim() !== '' &&
    storage.bucket.trim() !== '' &&
    storage.accessKeyId.trim() !== '' &&
    (storage.secretAccessKey ?? '').trim() !== ''
  )
}

function makeS3Backend(
  resolveContext: (options?: { requireEnabled?: boolean }) => Promise<S3StorageContext>,
): StorageBackend {
  return {
    driver: 's3',

    isAvailable(): boolean {
      const s = storageSettings()
      return s.enabled && isS3ConfigComplete(s)
    },

    async put(input: PutObjectInput): Promise<StoredObjectMeta> {
      const cacheControl = input.cacheControl ?? cacheControlForVisibility(input.visibility ?? 'public')
      const ctx = await resolveContext()
      await putObject(ctx, input.key, input.body, input.contentType, cacheControl)
      return { key: input.key, size: input.body.length, lastModified: new Date() }
    },

    async putStream(input: PutStreamInput): Promise<StoredObjectMeta> {
      let size = 0
      const meter = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          size += chunk.length
          callback(null, chunk)
        },
      })
      const ctx = await resolveContext()
      await putObject(
        ctx,
        input.key,
        input.body.pipe(meter),
        input.contentType,
        input.cacheControl ?? cacheControlForVisibility(input.visibility ?? 'private'),
      )
      return { key: input.key, size, lastModified: new Date() }
    },

    async get(key: string): Promise<Buffer> {
      return getObjectBuffer(await resolveContext({ requireEnabled: false }), key)
    },

    async getStream(key: string): Promise<Readable> {
      return getObjectStream(await resolveContext({ requireEnabled: false }), key)
    },

    async getStreamWithMeta(key: string): Promise<StreamWithMeta> {
      return getObjectStreamWithMeta(await resolveContext({ requireEnabled: false }), key)
    },

    async exists(key: string): Promise<boolean> {
      return objectExists(await resolveContext({ requireEnabled: false }), key)
    },

    async delete(key: string): Promise<void> {
      await deleteObject(await resolveContext({ requireEnabled: false }), key)
    },

    async deleteMany(keys: string[]): Promise<void> {
      await deleteObjects(await resolveContext(), keys)
    },

    async deletePrefix(prefix: string): Promise<void> {
      const ctx = await resolveContext({ requireEnabled: false })
      const objects = await listObjects(ctx, prefix)
      if (objects.length > 0) {
        await deleteObjects(
          ctx,
          objects.map((o) => o.key),
        )
      }
      if (prefix.endsWith('/')) {
        try {
          await deleteObject(ctx, prefix)
        } catch (error) {
          log.warn('Failed to delete prefix folder marker', { prefix, error })
        }
      }
    },

    async list(prefix: string, opts?: { maxKeys?: number; startAfter?: string }): Promise<StoredObjectMeta[]> {
      return listObjects(await resolveContext({ requireEnabled: false }), prefix, opts)
    },
  }
}

function storageSettings() {
  return requireBlogSettingsSection('assets').storage
}

export const s3Backend: StorageBackend = {
  ...makeS3Backend((options) => resolveS3Context(options)),
}

export function createS3BackendFromConfig(storage: S3StorageConfig): StorageBackend {
  let ctxPromise: Promise<S3StorageContext> | undefined
  const resolveContext = (): Promise<S3StorageContext> => {
    ctxPromise ??= (async () => {
      const sdk = await getAwsSdk()
      return { client: await newS3Client(sdk, storage), bucket: storage.bucket }
    })()
    return ctxPromise
  }
  const backend = makeS3Backend(resolveContext)
  return {
    ...backend,
    isAvailable(): boolean {
      return isS3ConfigComplete(storage)
    },
  }
}

export type S3ValidationResult = { ok: true } | { ok: false; descriptor: ErrorMessageDescriptor }

/**
 * Connectivity probe for a candidate config: HeadBucket first, with a ListObjectsV2(MaxKeys=1)
 * fallback for providers that deny HeadBucket. Distinguishes unreachable / bad credentials /
 * missing bucket so the caller can show an actionable message.
 */
export async function validateS3Config(storage: S3StorageConfig): Promise<S3ValidationResult> {
  const sdk = await getAwsSdk()
  const client = await newS3Client(sdk, storage)
  try {
    await client.send(new sdk.HeadBucketCommand({ Bucket: storage.bucket }))
    return { ok: true }
  } catch (error) {
    const statusCode = unsafeCast<{ $metadata?: { httpStatusCode?: number } }>(error).$metadata?.httpStatusCode
    if (statusCode === 403) {
      try {
        await client.send(new sdk.ListObjectsV2Command({ Bucket: storage.bucket, MaxKeys: 1 }))
        return { ok: true }
      } catch (fallbackError) {
        return { ok: false, descriptor: classifyS3ValidationError(fallbackError) }
      }
    }
    return { ok: false, descriptor: classifyS3ValidationError(error) }
  } finally {
    try {
      client.destroy()
    } catch {}
  }
}

export function classifyS3ValidationError(error: unknown): ErrorMessageDescriptor {
  const name = unsafeCast<{ name?: string }>(error).name ?? ''
  const statusCode = unsafeCast<{ $metadata?: { httpStatusCode?: number } }>(error).$metadata?.httpStatusCode
  if (statusCode === 404 || name === 'NotFound' || name === 'NoSuchBucket') {
    return descriptorFor('storage.error.bucketMissing')
  }
  if (
    statusCode === 401 ||
    statusCode === 403 ||
    name === 'AccessDenied' ||
    name === 'InvalidAccessKeyId' ||
    name === 'SignatureDoesNotMatch'
  ) {
    return descriptorFor('storage.error.credentialsInvalid')
  }
  if (name === 'TimeoutError' || name === 'ECONNREFUSED' || name === 'ENOTFOUND' || name === 'ETIMEDOUT') {
    return descriptorFor('storage.error.endpointUnreachable')
  }
  const causeCode = unsafeCast<{ cause?: { code?: string } }>(error).cause?.code
  if (
    causeCode === 'ECONNREFUSED' ||
    causeCode === 'ENOTFOUND' ||
    causeCode === 'ETIMEDOUT' ||
    causeCode === 'UND_ERR_CONNECT_TIMEOUT'
  ) {
    return descriptorFor('storage.error.endpointUnreachable')
  }
  log.warn('S3 connectivity probe failed', { error })
  return descriptorFor('storage.error.connectivityFailed')
}
