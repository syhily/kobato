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
  cacheControl?: string
  visibility?: ObjectVisibility
}

export interface PutStreamInput {
  key: string
  body: Readable
  contentType: string
  cacheControl?: string
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
  putStream(input: PutStreamInput): Promise<StoredObjectMeta>
  get(key: string): Promise<Buffer>
  getStream(key: string): Promise<Readable>
  getStreamWithMeta?(key: string): Promise<StreamWithMeta>
  exists(key: string): Promise<boolean>
  delete(key: string): Promise<void>
  deleteMany(keys: string[]): Promise<void>
  deletePrefix(prefix: string): Promise<void>
  list(prefix: string, opts?: { maxKeys?: number; startAfter?: string }): Promise<StoredObjectMeta[]>
}

export class StorageObjectNotFound extends ActionFailure {
  constructor(readonly key: string) {
    super(404, descriptorFor('storage.error.objectNotFound', { key }))
    this.name = 'StorageObjectNotFound'
  }
}

export const MAX_OBJECT_BUFFER_SIZE = 100 * 1024 * 1024
