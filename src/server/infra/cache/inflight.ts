// Coalesce concurrent requests for the same key into one promise (process-local).
// Cleanup runs in `.finally` — a failure never pins a rejected promise in the map.
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
