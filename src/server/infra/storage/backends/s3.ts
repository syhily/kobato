import type { Readable } from 'node:stream'

import type { PutObjectInput, PutStreamInput, StorageBackend, StoredObjectMeta } from '@/server/infra/storage/backend'

import { DEFAULT_PUBLIC_CACHE_CONTROL } from '@/server/infra/storage/backend'
import {
  deleteS3Object,
  deleteS3Objects,
  getS3ObjectBuffer,
  getS3ObjectStream,
  listS3Objects,
  putPublicS3Object,
  putS3Object,
  s3ObjectExists,
} from '@/server/infra/storage/s3-client'
import { requireBlogSettingsSection } from '@/shared/config/getters'

function storageSettings() {
  return requireBlogSettingsSection('assets').storage
}

/**
 * S3-compatible backend. A thin adapter over the existing `s3-client.ts`
 * primitive — the fingerprint-cached client, MD5-delete fallback, and
 * checksum workarounds all stay there untouched. This module only shapes
 * the primitive's functions into the `StorageBackend` contract.
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
      s.secretAccessKey.trim() !== ''
    )
  },

  async put(input: PutObjectInput): Promise<StoredObjectMeta> {
    // Branding/backups are private-cache; images/music are public-cache.
    if ((input.visibility ?? 'public') === 'private') {
      await putS3Object(input.key, input.body, input.contentType)
    } else {
      await putPublicS3Object({
        key: input.key,
        body: input.body,
        contentType: input.contentType,
        cacheControl: input.cacheControl ?? DEFAULT_PUBLIC_CACHE_CONTROL,
      })
    }
    return { key: input.key, size: input.body.length, lastModified: new Date() }
  },

  async putStream(input: PutStreamInput): Promise<StoredObjectMeta> {
    // `putS3Object` already accepts `Buffer | Readable` and writes with the
    // private cache control — exactly what streamed backups need.
    await putS3Object(input.key, input.body, input.contentType)
    return { key: input.key, size: 0, lastModified: new Date() }
  },

  async get(key: string): Promise<Buffer> {
    return getS3ObjectBuffer(key)
  },

  async getStream(key: string): Promise<Readable> {
    return getS3ObjectStream(key)
  },

  async exists(key: string): Promise<boolean> {
    // One `HeadObject` request with an exact-key match, rather than a
    // prefix listing. A failure (e.g. S3 misconfigured mid-migration) is
    // treated as "not present" — the subsequent PUT is idempotent and
    // overwrites, so this is safe.
    return s3ObjectExists(key)
  },

  async delete(key: string): Promise<void> {
    await deleteS3Object(key)
  },

  async deleteMany(keys: string[]): Promise<void> {
    await deleteS3Objects(keys)
  },

  async list(prefix: string, opts?: { maxKeys?: number }): Promise<StoredObjectMeta[]> {
    return listS3Objects(prefix, opts?.maxKeys)
  },
}
