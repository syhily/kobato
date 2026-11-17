// Process-local memoization primitives (no React, no Node APIs).
// "Share-in-flight" = concurrent callers await the same promise; failure
// policy: retry | keep-stale | no-cache.

/** Failure-resetting async memo: concurrent callers share the in-flight promise; a rejection is dropped and the next call retries. */
export function createPromiseMemo<T>(loader: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | null = null
  return () => {
    if (pending === null) {
      pending = loader().catch((error: unknown) => {
        pending = null
        throw error
      })
    }
    return pending
  }
}

export interface BoundedMap<K, V> {
  readonly size: number
  get: (key: K) => V | undefined
  has: (key: K) => boolean
  set: (key: K, value: V) => void
  delete: (key: K) => boolean
  keys: () => IterableIterator<K>
}

/** FIFO-evict bounded map: a NEW key at capacity evicts the oldest; re-setting an existing key never evicts. */
export function createBoundedMap<K, V>(cap: number): BoundedMap<K, V> {
  const map = new Map<K, V>()
  return {
    get size() {
      return map.size
    },
    get: (key) => map.get(key),
    has: (key) => map.has(key),
    set: (key, value) => {
      if (!map.has(key) && map.size >= cap) {
        const oldest = map.keys().next().value
        if (oldest !== undefined) {
          map.delete(oldest)
        }
      }
      map.set(key, value)
    },
    delete: (key) => map.delete(key),
    keys: () => map.keys(),
  }
}
