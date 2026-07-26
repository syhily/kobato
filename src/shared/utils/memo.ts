// Process-local memoization primitives. Plain module-scope state machines
// — no React, no Node APIs — so they run identically in the server and
// client bundles.
//
// Single-flight vocabulary used across the codebase: "share-in-flight"
// means concurrent callers await the same promise; the failure policy is
// one of "retry" (drop the rejected promise), "keep-stale" (serve the
// last good value), or "no-cache" (never store the empty result).

/**
 * Failure-resetting async memo: the first call starts `loader` and every
 * concurrent caller shares that in-flight promise; a resolved value is
 * memoized for the lifetime of the module. Single-flight semantics:
 * share-in-flight; failure: retry — a rejected promise is dropped, so
 * the next call runs `loader` again instead of serving a cached
 * rejection.
 */
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

/**
 * FIFO-evict bounded map: inserting a NEW key while at capacity evicts
 * the oldest-inserted entry. Re-setting an existing key updates it in
 * place (insertion order is preserved) and never triggers an eviction.
 */
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
