export interface Inflight<T> {
  (key: string, run: () => Promise<T>): Promise<T>
  size(): number
  has(key: string): boolean
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
  inflight.has = (key: string) => requests.has(key)
  return inflight
}
