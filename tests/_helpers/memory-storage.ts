// In-memory StorageBackend for integration tests — the single shared fake
// for the S3/local-disk external. Reads of an absent key reject with
// `StorageObjectNotFound`; deletes are idempotent; `list` honours prefix.
// Writes resolve Cache-Control exactly like the S3 adapter (`cacheControl`
// verbatim, else the `key-policy` visibility default); `getStreamWithMeta`
// exists only on the `s3` driver, mirroring the real backends (local FS
// stores no headers, so migration tests against a `local` fake exercise the
// key-policy fallback).
import { Readable } from 'node:stream'

import type {
  PutObjectInput,
  PutStreamInput,
  StorageBackend,
  StoredObjectMeta,
  StreamWithMeta,
} from '@/server/infra/storage/backend'
import type { StorageDriver } from '@/shared/config/types'

import { StorageObjectNotFound } from '@/server/infra/storage/backend'
import { cacheControlForVisibility } from '@/server/infra/storage/key-policy'

export interface MemoryStoredObject {
  body: Buffer
  contentType: string
  /** Cache-Control resolved at write time — what `getStreamWithMeta` reports back. */
  cacheControl?: string
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
    async put({ key, body, contentType, cacheControl, visibility }: PutObjectInput): Promise<StoredObjectMeta> {
      putKeys.push(key)
      store.set(key, {
        body,
        contentType,
        cacheControl: cacheControl ?? cacheControlForVisibility(visibility ?? 'public'),
      })
      return { key, size: body.length }
    },
    async putStream({ key, body, contentType, cacheControl, visibility }: PutStreamInput): Promise<StoredObjectMeta> {
      putKeys.push(key)
      const buffer = await drain(body)
      store.set(key, {
        body: buffer,
        contentType,
        cacheControl: cacheControl ?? cacheControlForVisibility(visibility ?? 'private'),
      })
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
    async list(prefix: string, opts?: { maxKeys?: number; startAfter?: string }): Promise<StoredObjectMeta[]> {
      let keys = [...store.keys()].filter((key) => key.startsWith(prefix)).sort()
      if (opts?.startAfter !== undefined) {
        const startAfter = opts.startAfter
        keys = keys.filter((key) => key > startAfter)
      }
      const capped = opts?.maxKeys === undefined ? keys : keys.slice(0, opts.maxKeys)
      return capped.map((key) => ({ key, size: store.get(key)!.body.length }))
    },
  }

  // Only the S3 driver reports stored headers — the real local backend has none.
  if (driver === 's3') {
    backend.getStreamWithMeta = async (key: string): Promise<StreamWithMeta> => {
      const entry = store.get(key)
      if (entry === undefined) {
        throw new StorageObjectNotFound(key)
      }
      return { body: Readable.from([entry.body]), contentType: entry.contentType, cacheControl: entry.cacheControl }
    }
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
