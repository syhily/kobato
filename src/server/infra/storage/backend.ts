import type { Readable } from 'node:stream'

import type { ObjectVisibility } from '@/server/infra/storage/key-policy'
import type { StorageDriver } from '@/shared/config/types'

import { ActionFailure } from '@/server/infra/http/errors'

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
  visibility?: ObjectVisibility
}

export interface PutStreamInput {
  key: string
  body: Readable
  contentType: string
  /**
   * `Cache-Control` header, carried verbatim by backend-to-backend copies.
   * Defaults to the `visibility`-derived value — without a `visibility`, the
   * private-cache value (streams are backups).
   */
  cacheControl?: string
  /** Visibility class the default `cacheControl` derives from (see `key-policy`). */
  visibility?: ObjectVisibility
}

/** Result of `getStreamWithMeta` — the body plus the headers a verbatim copy needs. */
export interface StreamWithMeta {
  body: Readable
  contentType?: string | undefined
  cacheControl?: string | undefined
}

/**
 * Pluggable storage backend: S3 (`backends/s3.ts`) or local (`DATA_PATH/storage/`).
 * Dispatchers resolve one through the registry, never importing a backend directly.
 * Absent-object reads reject with `StorageObjectNotFound`; deletes are idempotent.
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
  /**
   * Stream an object together with its stored Content-Type / Cache-Control
   * headers so a backend-to-backend migration can copy them verbatim.
   * Optional: backends without stored headers (local FS) omit it and the
   * migration falls back to key-based defaults.
   */
  getStreamWithMeta?(key: string): Promise<StreamWithMeta>
  exists(key: string): Promise<boolean>
  delete(key: string): Promise<void>
  deleteMany(keys: string[]): Promise<void>
  /** Delete every object under `prefix` including the prefix directory itself. */
  deletePrefix(prefix: string): Promise<void>
  /**
   * List objects under `prefix` in lexicographic key order. `startAfter`
   * resumes strictly after the given key (migration checkpointing).
   */
  list(prefix: string, opts?: { maxKeys?: number; startAfter?: string }): Promise<StoredObjectMeta[]>
}

/**
 * The seam's typed not-found, thrown by both adapters when an object is absent.
 * Extends `ActionFailure(404)` so an escaped miss still maps to a 404.
 */
export class StorageObjectNotFound extends ActionFailure {
  constructor(readonly key: string) {
    super(404, `存储对象不存在: ${key}`)
    this.name = 'StorageObjectNotFound'
  }
}

/** Hard cap for buffered reads (images / music / branding). Backups stream past it. */
export const MAX_OBJECT_BUFFER_SIZE = 100 * 1024 * 1024 // 100 MB
