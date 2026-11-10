import { Buffer } from 'node:buffer'

import type { CacheBucketId } from '@/shared/types/cache'

/**
 * Process-local L1 in front of the file cache (ADR-0013).
 *
 * The behavior plane (`registry`) reads and writes DECODED values here before
 * it touches disk, so a hot entry costs a Map lookup instead of a file read
 * plus a `JSON.parse`. Each bucket owns an LRU bounded on BOTH entry count and
 * estimated bytes; a single value above `MAX_ENTRY_BYTES` is never admitted —
 * one oversized payload would evict many small ones for a single hit.
 *
 * Invariants:
 * - Expiry is the deadline the disk envelope carries (`0` = never). A read past
 *   it evicts lazily, exactly like `file-store`; the registry never derives a
 *   fresh deadline here, so L1 can never outlive the file it mirrors.
 * - Process-local is safe: kobato ships as a single-process SEA binary, and
 *   every invalidation verb in the registry evicts synchronously.
 * - A hit returns the SAME decoded value to every caller (skipping the parse is
 *   the point), so cached values are read-only by contract — consumers must
 *   never mutate a cache result in place.
 * - Best-effort: nothing here does I/O or throws into a request path.
 */

interface MemoryBudget {
  maxEntries: number
  maxBytes: number
}

// Count caps track each bucket's key cardinality; byte caps bound the heap a
// bucket can pin when its values are large. The sum stays under ~12 MiB.
const BUCKET_BUDGETS: Record<CacheBucketId, MemoryBudget> = {
  // One entry per image path (~250B): wide and flat.
  imageMeta: { maxEntries: 2048, maxBytes: 2 * 1024 * 1024 },
  // Slug lists, one per (generation, query); a result can run to tens of KB.
  searchResult: { maxEntries: 64, maxBytes: 2 * 1024 * 1024 },
  // Full RSS/Atom bodies (~24KB); the scope × locale ceiling is small.
  feed: { maxEntries: 16, maxBytes: 1024 * 1024 },
  sitemap: { maxEntries: 8, maxBytes: 512 * 1024 },
  // Fixed-key buckets: the count cap only absorbs a settings-revision churn.
  tags: { maxEntries: 8, maxBytes: 256 * 1024 },
  categories: { maxEntries: 8, maxBytes: 256 * 1024 },
  // One sidebar digest per (revision, widget count).
  comments: { maxEntries: 16, maxBytes: 1024 * 1024 },
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
  /** Estimated retained bytes (serialized JSON length or Buffer byteLength). */
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
    // Circular/BigInt values are not cacheable JSON; report them as unbounded
    // so they stay out of L1 (the disk write rejects them too).
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
  /** Encoded payload size for binary entries: a Buffer nested in a decoded
   *  shape cannot be measured by serializing the wrapper. Omit for JSON values,
   *  which are measured by their serialized length. */
  bytes?: number
}

/**
 * `meta.bytes` overrides the size estimate for binary entries; JSON values are
 * measured by their serialized length.
 */
export function setMemoryItem(id: CacheBucketId, key: string, value: unknown, meta: MemoryEntryMeta): void {
  // A JSON `null` reads as a miss on the disk plane as well, so it never
  // becomes an L1 entry worth keeping.
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

export function removeMemoryItem(id: CacheBucketId, key: string): void {
  const store = stores.get(id)
  if (store !== undefined) {
    evict(store, key)
  }
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
