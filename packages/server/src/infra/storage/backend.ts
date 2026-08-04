import type { StorageDriver } from '@kobato/shared/config/types'
import type { Readable } from 'node:stream'

import { ActionFailure } from '@kobato/server/infra/http/errors'

export interface StoredObjectMeta {
  key: string
  size: number
  etag?: string
  lastModified?: Date
}

export interface PutObjectInput {
  key: string
  body: Buffer
  contentType: string
  /** `Cache-Control` header. Defaults to the visibility-appropriate immutable value. */
  cacheControl?: string
  /** `public` assets are CDN-cacheable; `private` ones (branding/backup) get a private cache. Defaults to `public`. */
  visibility?: 'public' | 'private'
}

export interface PutStreamInput {
  key: string
  body: Readable
  contentType: string
  visibility?: 'public' | 'private'
}

/**
 * Pluggable storage backend. Two implementations exist: S3
 * (`backends/s3.ts`) and local (under `DATA_PATH/storage/`). Domain
 * dispatchers never import a backend directly — they go through the
 * registry: resolve one via `activeBackend()` (writes) or
 * `backendFor(driver)` (reads/deletes/migration), or iterate every
 * registered backend via `allBackends()` (the backup reconcile).
 *
 * URL resolution is intentionally NOT on this interface: the public URL
 * depends on the driver + the configured base URLs, which the registry
 * and `public-url.ts` handle centrally.
 *
 * Error contract: a read of an absent object (`get` / `getStream`) rejects
 * with `StorageObjectNotFound` — never a backend-specific error — so callers
 * `instanceof`-check instead of substring-matching messages. Deletes are
 * idempotent and stay silent on a missing object.
 */
export interface StorageBackend {
  readonly driver: StorageDriver
  /** Whether this backend is usable for new uploads under the current config. */
  isAvailable(): boolean
  put(input: PutObjectInput): Promise<StoredObjectMeta>
  /** Streaming put for large/unknown-length bodies (backups). `size` in the result is the exact stored byte count. */
  putStream(input: PutStreamInput): Promise<StoredObjectMeta>
  /** Read the whole object into a buffer (capped at `MAX_OBJECT_BUFFER_SIZE`). */
  get(key: string): Promise<Buffer>
  /** Stream an object without buffering (large backups). */
  getStream(key: string): Promise<Readable>
  exists(key: string): Promise<boolean>
  delete(key: string): Promise<void>
  deleteMany(keys: string[]): Promise<void>
  /** Delete every object under `prefix` including the prefix directory itself. */
  deletePrefix(prefix: string): Promise<void>
  list(prefix: string, opts?: { maxKeys?: number }): Promise<StoredObjectMeta[]>
}

/**
 * The seam's typed not-found. Both adapters throw exactly this when an
 * object is absent (local: ENOENT / a directory key; S3: `NoSuchKey` /
 * `NotFound` / a bare 404, or an empty `GetObject` body). It extends
 * `ActionFailure(404)` so a miss that escapes a caller still maps to a 404
 * at the HTTP perimeter — the contract the local adapter always had.
 */
export class StorageObjectNotFound extends ActionFailure {
  constructor(readonly key: string) {
    super(404, `存储对象不存在: ${key}`)
    this.name = 'StorageObjectNotFound'
  }
}

/** Hard cap for buffered reads (images / music / branding). Backups stream past it. */
export const MAX_OBJECT_BUFFER_SIZE = 100 * 1024 * 1024 // 100 MB

export const DEFAULT_PUBLIC_CACHE_CONTROL = 'public, max-age=31536000, immutable'
export const DEFAULT_PRIVATE_CACHE_CONTROL = 'private, max-age=31536000'
