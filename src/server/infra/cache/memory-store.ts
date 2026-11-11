import { Buffer } from 'node:buffer'

import type { CacheBucketId } from '@/shared/types/cache'

/**
 * Process-local L1 in front of the file cache: DECODED values, so a hot entry
 * costs a Map lookup instead of a file read plus a `JSON.parse`. Each bucket
 * owns an LRU bounded on entry count AND estimated bytes; a value above
 * `MAX_ENTRY_BYTES` is never admitted (it would displace many small entries
 * for a single hit).
 *
 * - Expiry is the disk envelope's own deadline (`0` = never); L1 never derives
 *   a fresh one, so a memory copy can never outlive the file it mirrors.
 * - A hit returns the SAME decoded object to every caller — cached values are
 *   read-only by contract; consumers must never mutate a result in place.
 * - Best-effort: nothing here does I/O or throws into a request path.
 */

interface MemoryBudget {
  maxEntries: number
  maxBytes: number
}

// Count caps track each bucket's key cardinality; byte caps bound the heap a
// bucket can pin when its values are large. The sum stays under ~12 MiB.
const BUCKET_BUDGETS: Record<CacheBucketId, MemoryBudget> = {
  // Slug lists, one per (generation, query); a result can run to tens of KB.
  searchResult: { maxEntries: 64, maxBytes: 2 * 1024 * 1024 },
  // Full RSS/Atom bodies (~24KB); the scope × locale ceiling is small.
  feed: { maxEntries: 16, maxBytes: 1024 * 1024 },
  sitemap: { maxEntries: 8, maxBytes: 512 * 1024 },
  // One object per owner/repo/endpoint.
  githubRelease: { maxEntries: 8, maxBytes: 512 * 1024 },
  // One base64 URL (or '' while the upstream is failing).
  githubAvatar: { maxEntries: 4, maxBytes: 64 * 1024 },
  // These two buckets are L1-EXEMPT BY POLICY: their renders are file-only, and
  // a zero budget is a hard refusal in `setMemoryItem` (independent of value size).
  og: { maxEntries: 0, maxBytes: 0 },
  calendar: { maxEntries: 0, maxBytes: 0 },
  // Many small avatar PNGs served straight into an HTTP response.
  avatar: { maxEntries: 512, maxBytes: 4 * 1024 * 1024 },
}

/** Entries above this stay file-only: they would displace too many small hot entries. */
const MAX_ENTRY_BYTES = 64 * 1024

interface MemoryEntry {
  value: unknown
  /** Absolute deadline (epoch ms), `0` = never — the disk envelope's value. */
  expiresAtMs: number
  bytes: number
}

interface BucketStore {
  /** Insertion order IS the LRU order: oldest first; a read re-inserts (touch). */
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
    // Not cacheable JSON (circular/BigInt): report unbounded so it stays out of L1.
    return Number.POSITIVE_INFINITY
  }
}

/** The cached value, or `undefined` for a miss/expired entry (`undefined` is
 *  never stored, so the sentinel is unambiguous). */
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
  // Touch: delete + set moves the key to the MRU end of the insertion order.
  store.entries.delete(key)
  store.entries.set(key, entry)
  return entry.value
}

export interface MemoryEntryMeta {
  /** Absolute deadline (epoch ms), `0` = never — the disk envelope's value. */
  expiresAtMs: number
  /** Encoded payload size for binary entries (a nested Buffer can't be
   *  measured by serializing the wrapper); omit for JSON values. */
  bytes?: number
}

export function setMemoryItem(id: CacheBucketId, key: string, value: unknown, meta: MemoryEntryMeta): void {
  // `null` reads as a miss on the disk plane too, so it never enters L1.
  if (value === null || value === undefined) {
    return
  }
  const { expiresAtMs } = meta
  if (expiresAtMs !== 0 && expiresAtMs <= Date.now()) {
    return
  }
  const budget = BUCKET_BUDGETS[id]
  // Zero budget is a hard refusal for the whole bucket — without this, a
  // zero-byte value would slip past the `size > maxBytes` check below.
  if (budget.maxEntries === 0 || budget.maxBytes === 0) {
    return
  }
  const size = meta.bytes ?? estimateBytes(value)
  const store = storeFor(id)
  // A rewrite supersedes the previous value — drop it before sizing the new one.
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

/** Drop a whole bucket's memory entries (synchronous invalidation contract). */
export function clearMemoryBucket(id: CacheBucketId): void {
  stores.delete(id)
}

/** Restore-completion wipe: every bucket's L1 goes cold. */
export function wipeMemoryCache(): void {
  stores.clear()
}

/** Test-only seam (mirrors `registry::__resetCacheCountersForTests`). */
export function __resetMemoryCacheForTests(): void {
  wipeMemoryCache()
}
