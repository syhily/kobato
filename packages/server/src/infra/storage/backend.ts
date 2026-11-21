import type { ObjectVisibility } from '@kobato/server/infra/storage/key-policy'
import type { StorageDriver } from '@kobato/settings/types'
import type { Readable } from 'node:stream'

import { descriptorFor } from '@kobato/server/infra/http/error-descriptor'
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
  visibility?: ObjectVisibility
}

export interface PutStreamInput {
  key: string
  body: Readable
  contentType: string
  /** `Cache-Control` header, carried verbatim by backend-to-backend copies. Defaults
   *  to the `visibility`-derived value; without a `visibility`, the private value
   *  (streams are backups). */
  cacheControl?: string
  /** Visibility class the default `cacheControl` derives from (see `key-policy`). */
  visibility?: ObjectVisibility
}

export interface StreamWithMeta {
  body: Readable
  contentType?: string | undefined
  cacheControl?: string | undefined
}

export interface StorageBackend {
  readonly driver: StorageDriver
  isAvailable(): boolean
  put(input: PutObjectInput): Promise<StoredObjectMeta>
  /** Streaming put for large/unknown-length bodies (backups). `size` in the result is the exact stored byte count. */
  putStream(input: PutStreamInput): Promise<StoredObjectMeta>
  get(key: string): Promise<Buffer>
  getStream(key: string): Promise<Readable>
  /** Streams an object with its stored Content-Type / Cache-Control headers so a
   *  backend-to-backend migration can copy them verbatim; omitted by backends with no
   *  stored headers (local FS), where the migration uses key-based defaults. */
  getStreamWithMeta?(key: string): Promise<StreamWithMeta>
  exists(key: string): Promise<boolean>
  delete(key: string): Promise<void>
  deleteMany(keys: string[]): Promise<void>
  deletePrefix(prefix: string): Promise<void>
  /**
   * List objects under `prefix` in lexicographic key order. `startAfter`
   * resumes strictly after the given key (migration checkpointing).
   */
  list(prefix: string, opts?: { maxKeys?: number; startAfter?: string }): Promise<StoredObjectMeta[]>
}

export class StorageObjectNotFound extends ActionFailure {
  constructor(readonly key: string) {
    super(404, descriptorFor('storage.error.objectNotFound', { key }))
    this.name = 'StorageObjectNotFound'
  }
}

export const MAX_OBJECT_BUFFER_SIZE = 100 * 1024 * 1024
