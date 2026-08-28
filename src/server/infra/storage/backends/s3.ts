import type { GetObjectCommandOutput, ServiceInputTypes, ServiceOutputTypes, _Object } from '@aws-sdk/client-s3'
import type { FinalizeRequestMiddleware, HandlerExecutionContext } from '@smithy/types'

import { createHash } from 'node:crypto'
import { Readable, Transform } from 'node:stream'

import type {
  PutObjectInput,
  PutStreamInput,
  StorageBackend,
  StoredObjectMeta,
  StreamWithMeta,
} from '@/server/infra/storage/backend'
import type { AssetsSettings } from '@/shared/config/types'

import { ActionFailure } from '@/server/infra/http/errors'
import { getLogger } from '@/server/infra/logger'
import { MAX_OBJECT_BUFFER_SIZE, StorageObjectNotFound } from '@/server/infra/storage/backend'
import { cacheControlForVisibility } from '@/server/infra/storage/key-policy'
import { requireBlogSettingsSection } from '@/shared/config/getters'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

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
    //
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

/**
 * Resolve the live S3 client + bucket. Throws 503 when uploads are disabled
 * (unless `requireEnabled: false`) or credentials are half-configured.
 */
async function resolveS3Context(options?: { requireEnabled?: boolean }): Promise<S3StorageContext> {
  const settings = requireBlogSettingsSection('assets')
  const storage = settings.storage
  if (options?.requireEnabled !== false && !storage.enabled) {
    throw new ActionFailure(503, '图片上传未开启；请到 /admin/library/storage 完成存储迁移以启用 S3')
  }
  if ((storage.secretAccessKey ?? '') === '') {
    throw new ActionFailure(503, '请先在 /admin/library/storage 配置 S3 凭据')
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
  // S3 caps a page at 1000 keys; `MaxKeys` is sent per page (never more than
  // the caller's remaining budget) so `list(prefix, { maxKeys })` is honored
  // exactly and batched callers (migration) get the page size they asked for.
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

async function getObjectBuffer(ctx: S3StorageContext, key: string, maxSize = MAX_OBJECT_BUFFER_SIZE): Promise<Buffer> {
  const sdk = await getAwsSdk()
  const response = await sendGetObject(sdk, ctx.client, ctx.bucket, key)
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
async function getObjectStream(ctx: S3StorageContext, key: string): Promise<Readable> {
  const sdk = await getAwsSdk()
  const response = await sendGetObject(sdk, ctx.client, ctx.bucket, key)
  if (response.Body === undefined) {
    throw new StorageObjectNotFound(key)
  }
  return unsafeCast<Readable>(response.Body)
}

/** `getObjectStream` plus the stored headers a verbatim migration copy needs. */
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

/** A config is usable once every connection field carries a real value. */
function isS3ConfigComplete(storage: S3StorageConfig): boolean {
  return (
    storage.endpoint.trim() !== '' &&
    storage.bucket.trim() !== '' &&
    storage.accessKeyId.trim() !== '' &&
    (storage.secretAccessKey ?? '').trim() !== ''
  )
}

/**
 * Build a backend bound to one context. Shared by the settings-driven
 * singleton (`s3Backend`) and the migration's explicit-config backend
 * (`createS3BackendFromConfig`).
 */
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
      // The visibility → cache-control mapping lives in `key-policy` and nowhere else.
      const cacheControl = input.cacheControl ?? cacheControlForVisibility(input.visibility ?? 'public')
      const ctx = await resolveContext()
      await putObject(ctx, input.key, input.body, input.contentType, cacheControl)
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
      const ctx = await resolveContext()
      await putObject(
        ctx,
        input.key,
        input.body.pipe(meter),
        input.contentType,
        // Verbatim cache-control wins (migration copies); otherwise the
        // visibility-derived default, private when no visibility is given.
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
      // No real directories: delete every object under the prefix (paginated).
      const objects = await listObjects(ctx, prefix)
      if (objects.length > 0) {
        await deleteObjects(
          ctx,
          objects.map((o) => o.key),
        )
      }
      // Some services persist a folder-marker object at the prefix — best-effort delete it (missing marker is not an error).
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

/**
 * Build an S3 backend bound to an explicit config instead of the live
 * settings — used by the storage migration to talk to the TARGET bucket
 * while the settings still point at the source. The client is created once
 * lazily and never touches the settings-driven cache.
 */
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
  // `isAvailable` on the settings-driven singleton reads live settings; an
  // explicit-config backend is available iff the config itself is complete.
  return {
    ...backend,
    isAvailable(): boolean {
      return isS3ConfigComplete(storage)
    },
  }
}

export type S3ValidationResult = { ok: true } | { ok: false; message: string }

/**
 * Connectivity probe for a candidate S3 config — HeadBucket first, with a
 * ListObjectsV2(MaxKeys=1) fallback for providers/credentials that lack
 * HeadBucket. Distinguishes unreachable / bad credentials / missing bucket
 * so the caller can show an actionable message.
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
      // Some providers deny HeadBucket while ListObjects works — probe once more.
      try {
        await client.send(new sdk.ListObjectsV2Command({ Bucket: storage.bucket, MaxKeys: 1 }))
        return { ok: true }
      } catch (fallbackError) {
        return { ok: false, message: classifyS3ValidationError(fallbackError) }
      }
    }
    return { ok: false, message: classifyS3ValidationError(error) }
  } finally {
    try {
      client.destroy()
    } catch {
      // Best-effort cleanup — a half-connected client may fail to destroy.
    }
  }
}

/** Exported for unit tests — the error→message classification table. */
export function classifyS3ValidationError(error: unknown): string {
  const name = unsafeCast<{ name?: string }>(error).name ?? ''
  const statusCode = unsafeCast<{ $metadata?: { httpStatusCode?: number } }>(error).$metadata?.httpStatusCode
  if (statusCode === 404 || name === 'NotFound' || name === 'NoSuchBucket') {
    return '存储桶不存在或无权访问，请检查 Bucket 名称'
  }
  if (
    statusCode === 401 ||
    statusCode === 403 ||
    name === 'AccessDenied' ||
    name === 'InvalidAccessKeyId' ||
    name === 'SignatureDoesNotMatch'
  ) {
    return '凭证无效或权限不足，请检查 Access Key / Secret Key'
  }
  if (name === 'TimeoutError' || name === 'ECONNREFUSED' || name === 'ENOTFOUND' || name === 'ETIMEDOUT') {
    return '无法连接到 Endpoint，请检查网络与 Endpoint 地址'
  }
  const causeCode = unsafeCast<{ cause?: { code?: string } }>(error).cause?.code
  if (
    causeCode === 'ECONNREFUSED' ||
    causeCode === 'ENOTFOUND' ||
    causeCode === 'ETIMEDOUT' ||
    causeCode === 'UND_ERR_CONNECT_TIMEOUT'
  ) {
    return '无法连接到 Endpoint，请检查网络与 Endpoint 地址'
  }
  return `S3 连通性验证失败：${error instanceof Error ? error.message : String(error)}`
}

// URL resolution lives in `public-url.ts` so URL-only SSR paths never load the AWS SDK.
