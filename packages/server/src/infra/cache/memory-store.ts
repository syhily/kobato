import type { CacheBucketId } from '@kobato/settings/cache-bucket'

import { Buffer } from 'node:buffer'

interface MemoryBudget {
  maxEntries: number
  maxBytes: number
}

const BUCKET_BUDGETS: Record<CacheBucketId, MemoryBudget> = {
  searchResult: { maxEntries: 64, maxBytes: 2 * 1024 * 1024 },
  feed: { maxEntries: 16, maxBytes: 1024 * 1024 },
  sitemap: { maxEntries: 8, maxBytes: 512 * 1024 },
  githubRelease: { maxEntries: 8, maxBytes: 512 * 1024 },
  githubAvatar: { maxEntries: 4, maxBytes: 64 * 1024 },
  og: { maxEntries: 0, maxBytes: 0 },
  calendar: { maxEntries: 0, maxBytes: 0 },
  avatar: { maxEntries: 512, maxBytes: 4 * 1024 * 1024 },
}

const MAX_ENTRY_BYTES = 64 * 1024

interface MemoryEntry {
  value: unknown
  expiresAtMs: number
  bytes: number
}

interface BucketStore {
  entries: Map<string, MemoryEntry>
  bytes: number
}

const stores = new Map<CacheBucketId, BucketStore>()

function storeFor(id: CacheBucketId): BucketStore {
  let store = stores.get(id)
  if (store === undefined) {
    store = { entries: new Map(), bytes: 0 }
    stores.set(id, store)
  }
  return store
}

function evict(store: BucketStore, key: string): void {
  const entry = store.entries.get(key)
  if (entry === undefined) {
    return
  }
  store.entries.delete(key)
  store.bytes -= entry.bytes
}

function estimateBytes(value: unknown): number {
  if (Buffer.isBuffer(value)) {
    return value.byteLength
  }
  try {
    return Buffer.byteLength(JSON.stringify(value) ?? '', 'utf8')
  } catch {
    return Number.POSITIVE_INFINITY
  }
}

export function getMemoryItem(id: CacheBucketId, key: string): unknown {
  const store = stores.get(id)
  const entry = store?.entries.get(key)
  if (store === undefined || entry === undefined) {
    return undefined
  }
  if (entry.expiresAtMs !== 0 && entry.expiresAtMs <= Date.now()) {
    evict(store, key)
    return undefined
  }
  store.entries.delete(key)
  store.entries.set(key, entry)
  return entry.value
}

export interface MemoryEntryMeta {
  expiresAtMs: number
  bytes?: number
}

export function setMemoryItem(id: CacheBucketId, key: string, value: unknown, meta: MemoryEntryMeta): void {
  if (value === null || value === undefined) {
    return
  }
  const { expiresAtMs } = meta
  if (expiresAtMs !== 0 && expiresAtMs <= Date.now()) {
    return
  }
  const budget = BUCKET_BUDGETS[id]
  if (budget.maxEntries === 0 || budget.maxBytes === 0) {
    return
  }
  const size = meta.bytes ?? estimateBytes(value)
  const store = storeFor(id)
  evict(store, key)
  if (size > MAX_ENTRY_BYTES || size > budget.maxBytes) {
    return
  }
  while (store.entries.size >= budget.maxEntries || store.bytes + size > budget.maxBytes) {
    const oldest = store.entries.keys().next()
    if (oldest.done) {
      break
    }
    evict(store, oldest.value)
  }
  store.entries.set(key, { value, expiresAtMs, bytes: size })
  store.bytes += size
}

export function clearMemoryBucket(id: CacheBucketId): void {
  stores.delete(id)
}

export function wipeMemoryCache(): void {
  stores.clear()
}

export function __resetMemoryCacheForTests(): void {
  wipeMemoryCache()
}
