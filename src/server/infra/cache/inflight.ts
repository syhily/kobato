// Coalesce concurrent in-flight requests for the same key into a single
// promise so a hot key (e.g. the homepage OG image right after a deploy)
// can't trigger N parallel renders. The map is process-local; cleanup runs
// in `.finally` so failures don't pin a rejected promise in the cache.
export interface Inflight<T> {
  (key: string, run: () => Promise<T>): Promise<T>
  size(): number
}

export function createInflight<T>(): Inflight<T> {
  const requests = new Map<string, Promise<T>>()
  const inflight = (key: string, run: () => Promise<T>): Promise<T> => {
    let pending = requests.get(key)
    if (pending !== undefined) {
      return pending
    }
    pending = run().finally(() => {
      requests.delete(key)
    })
    requests.set(key, pending)
    return pending
  }
  inflight.size = () => requests.size
  return inflight
}
