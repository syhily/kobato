import type {
  PutObjectInput,
  PutStreamInput,
  StorageBackend,
  StoredObjectMeta,
} from '@kobato/server/infra/storage/backend'
import type { StorageDriver } from '@kobato/shared/config/types'

import { StorageObjectNotFound } from '@kobato/server/infra/storage/backend'
// In-memory StorageBackend for integration tests — the single shared
// fake for the S3/local-disk external. Every test that routes the
// storage registry at an in-memory backend builds it here instead of
// hand-rolling a Map-backed double, so the seam's full contract
// (put/putStream/get/getStream/exists/delete/deleteMany/deletePrefix/
// list) behaves the same everywhere: reads of an absent key reject with
// `StorageObjectNotFound` exactly like the real adapters, deletes are
// idempotent, and `list` honours prefix + maxKeys.
import { Readable } from 'node:stream'

export interface MemoryStoredObject {
  body: Buffer
  contentType: string
}

export interface MemoryBackend {
  /** The StorageBackend to hand to the registry seam. */
  backend: StorageBackend
  /** key → stored payload. */
  store: Map<string, MemoryStoredObject>
  /** Every key passed to put/putStream, in call order. */
  putKeys: string[]
  /** Every key passed to delete/deleteMany/deletePrefix, in call order. */
  deletedKeys: string[]
  /** Drop all objects and recorded calls. */
  reset: () => void
}

async function drain(body: Readable): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of body) {
    chunks.push(chunk as Buffer)
  }
  return Buffer.concat(chunks)
}

export function makeMemoryBackend({ driver = 's3' }: { driver?: StorageDriver } = {}): MemoryBackend {
  const store = new Map<string, MemoryStoredObject>()
  const putKeys: string[] = []
  const deletedKeys: string[] = []

  const backend: StorageBackend = {
    driver,
    isAvailable: () => true,
    async put({ key, body, contentType }: PutObjectInput): Promise<StoredObjectMeta> {
      putKeys.push(key)
      store.set(key, { body, contentType })
      return { key, size: body.length }
    },
    async putStream({ key, body, contentType }: PutStreamInput): Promise<StoredObjectMeta> {
      putKeys.push(key)
      const buffer = await drain(body)
      store.set(key, { body: buffer, contentType })
      return { key, size: buffer.length }
    },
    async get(key: string): Promise<Buffer> {
      const entry = store.get(key)
      if (entry === undefined) {
        throw new StorageObjectNotFound(key)
      }
      return entry.body
    },
    async getStream(key: string): Promise<Readable> {
      const entry = store.get(key)
      if (entry === undefined) {
        throw new StorageObjectNotFound(key)
      }
      return Readable.from([entry.body])
    },
    async exists(key: string): Promise<boolean> {
      return store.has(key)
    },
    async delete(key: string): Promise<void> {
      deletedKeys.push(key)
      store.delete(key)
    },
    async deleteMany(keys: string[]): Promise<void> {
      for (const key of keys) {
        deletedKeys.push(key)
        store.delete(key)
      }
    },
    async deletePrefix(prefix: string): Promise<void> {
      // Map iterators tolerate deleting the current entry mid-iteration.
      for (const key of store.keys()) {
        if (key.startsWith(prefix)) {
          deletedKeys.push(key)
          store.delete(key)
        }
      }
    },
    async list(prefix: string, opts?: { maxKeys?: number }): Promise<StoredObjectMeta[]> {
      const keys = [...store.keys()].filter((key) => key.startsWith(prefix)).sort()
      const capped = opts?.maxKeys === undefined ? keys : keys.slice(0, opts.maxKeys)
      return capped.map((key) => ({ key, size: store.get(key)!.body.length }))
    },
  }

  return {
    backend,
    store,
    putKeys,
    deletedKeys,
    reset: () => {
      store.clear()
      putKeys.length = 0
      deletedKeys.length = 0
    },
  }
}
