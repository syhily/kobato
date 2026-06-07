import type { ServiceInputTypes, ServiceOutputTypes, _Object } from '@aws-sdk/client-s3'
import type { FinalizeRequestMiddleware, HandlerExecutionContext } from '@smithy/types'

import { createHash } from 'node:crypto'
import { Readable } from 'node:stream'

import type { AssetsSettings } from '@/shared/config/types'

import { ActionFailure } from '@/server/infra/http/errors'
import { getLogger } from '@/server/infra/logger'
import { requireBlogSettingsSection } from '@/shared/config/getters'

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

// --- Public types ---

export interface S3StorageContext {
  client: S3ClientInstance
  bucket: string
}

export interface PutPublicS3ObjectInput {
  key: string
  body: Buffer
  contentType: string
  cacheControl?: string
}

export interface S3ObjectMeta {
  key: string
  size: number
  lastModified: Date
}

// --- Context resolver ---

/**
 * Resolve the live S3 client + bucket name for the current request.
 * Throws `ActionFailure(503)` when the upload toggle is OFF or when
 * the credentials are half-configured. Domain dispatchers (images,
 * music, backup) are the canonical entry points — callers should not
 * reach this helper directly.
 */
export async function getS3StorageContext(options?: { requireEnabled?: boolean }): Promise<S3StorageContext> {
  const settings = requireBlogSettingsSection('assets')
  const storage = settings.storage
  if (options?.requireEnabled !== false && !storage.enabled) {
    throw new ActionFailure(503, '图片上传未开启；请到 /admin/settings/assets 打开「启用 S3 上传」')
  }
  if (storage.secretAccessKey === '') {
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
      secretAccessKey: storage.secretAccessKey,
    },
    // Some S3-compatible services return base64-encoded Content-MD5 while
    // the AWS SDK v3 expects hex, causing a false "Checksum mismatch" on
    // GetObject. WHEN_REQUIRED skips automatic response validation unless
    // the caller explicitly asks for it (ChecksumMode: ENABLED).
    responseChecksumValidation: 'WHEN_REQUIRED' as const,
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
      const request = args.request as { headers: Record<string, string>; body?: unknown }
      for (const header of Object.keys(request.headers)) {
        const lower = header.toLowerCase()
        if (lower.startsWith('x-amz-checksum-') || lower.startsWith('x-amz-sdk-checksum-')) {
          delete request.headers[header]
        }
      }
      if (request.body !== undefined && request.body !== null) {
        const body = Buffer.from(request.body as string | Uint8Array)
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

export async function putPublicS3Object(input: PutPublicS3ObjectInput): Promise<void> {
  const sdk = await getAwsSdk()
  const { client, bucket } = await getS3StorageContext()
  await client.send(
    new sdk.PutObjectCommand({
      Bucket: bucket,
      Key: input.key,
      Body: input.body,
      ContentType: input.contentType,
      CacheControl: input.cacheControl ?? 'public, max-age=31536000, immutable',
    }),
  )
}

function parseS3Contents(contents: _Object[] | undefined): S3ObjectMeta[] {
  const objects: S3ObjectMeta[] = []
  for (const item of contents ?? []) {
    if (item.Key && item.LastModified && item.Size !== undefined) {
      objects.push({ key: item.Key, size: item.Size, lastModified: item.LastModified })
    }
  }
  return objects
}

export async function listS3Objects(prefix: string, maxKeys = 10_000): Promise<S3ObjectMeta[]> {
  const sdk = await getAwsSdk()
  const { client, bucket } = await getS3StorageContext({ requireEnabled: false })
  const objects: S3ObjectMeta[] = []
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
      getLogger('s3').warn('listS3Objects exceeded maxKeys; pagination aborted', {
        prefix,
        maxKeys,
        returned: objects.length,
      })
      break
    }
  } while (continuationToken)
  return objects
}

export interface ListS3ObjectsPaginatedResult {
  objects: S3ObjectMeta[]
  nextContinuationToken?: string
}

export async function listS3ObjectsPaginated(
  prefix: string,
  maxKeys?: number,
  continuationToken?: string,
): Promise<ListS3ObjectsPaginatedResult> {
  const sdk = await getAwsSdk()
  const { client, bucket } = await getS3StorageContext({ requireEnabled: false })
  const response = await client.send(
    new sdk.ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      MaxKeys: maxKeys,
      ContinuationToken: continuationToken,
    }),
  )
  return { objects: parseS3Contents(response.Contents), nextContinuationToken: response.NextContinuationToken }
}

const MAX_S3_BUFFER_SIZE = 100 * 1024 * 1024 // 100 MB

export async function getS3ObjectBuffer(key: string, maxSize = MAX_S3_BUFFER_SIZE): Promise<Buffer> {
  const sdk = await getAwsSdk()
  const { client, bucket } = await getS3StorageContext({ requireEnabled: false })
  const response = await client.send(new sdk.GetObjectCommand({ Bucket: bucket, Key: key }))
  if (response.Body === undefined) {
    throw new ActionFailure(404, 'S3 对象不存在或内容为空')
  }
  const contentLength = response.ContentLength
  if (contentLength !== undefined && contentLength > maxSize) {
    throw new ActionFailure(413, `S3 对象过大 (${contentLength} 字节)，超出 ${maxSize} 字节限制`)
  }
  const stream = response.Body as Readable
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

export async function putS3Object(key: string, body: Buffer | Readable, contentType?: string): Promise<void> {
  const sdk = await getAwsSdk()
  const { client, bucket } = await getS3StorageContext()
  await client.send(
    new sdk.PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: 'private, max-age=31536000',
    }),
  )
}

export async function deleteS3Object(key: string): Promise<void> {
  const sdk = await getAwsSdk()
  const { client, bucket } = await getS3StorageContext({ requireEnabled: false })
  await client.send(new sdk.DeleteObjectCommand({ Bucket: bucket, Key: key }))
}

export async function deleteS3Objects(keys: string[]): Promise<void> {
  if (keys.length === 0) {
    return
  }
  const sdk = await getAwsSdk()
  const { client, bucket } = await getS3StorageContext()
  await client.send(
    new sdk.DeleteObjectsCommand({
      Bucket: bucket,
      Delete: { Objects: keys.map((key) => ({ Key: key })) },
    }),
  )
}

// `buildPublicUrl` lives in `@/server/domains/images/services/cache` and
// reads the live `publicBaseUrl` through `@/server/domains/images/storage`'s
// dispatcher. Keeping it out of this module is what allows the SSR
// enhancer to stay free of the AWS SDK in code paths that only need
// to compute a URL (no PUT/DELETE).
