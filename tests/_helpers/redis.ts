import { vi } from 'vite-plus/test'

// Tiny in-memory Redis double good enough for the surface our app uses:
//   - ioredis-style: get/set/del/incr/expire/ttl/pipeline (session.server.ts)
//   - cache-style: getItem/setItem/getItemRaw/setItemRaw/
//     removeItem/hasItem/getKeys (image-cache, avatar-cache, thumbhash, search)
// Keeping both shapes available behind one Map lets a test stub either
// surface and observe through the same store.

interface Entry {
  value: unknown
  /** epoch ms when this entry expires (`null` = no TTL). */
  expiresAt: number | null
}

function isExpired(entry: Entry, now: number): boolean {
  return entry.expiresAt !== null && entry.expiresAt <= now
}

export interface MockRedis {
  // ioredis surface
  get: ReturnType<typeof vi.fn<(key: string) => Promise<string | null>>>
  set: ReturnType<typeof vi.fn>
  del: ReturnType<typeof vi.fn<(key: string) => Promise<number>>>
  incr: ReturnType<typeof vi.fn<(key: string) => Promise<number>>>
  expire: ReturnType<typeof vi.fn<(key: string, seconds: number) => Promise<number>>>
  ttl: ReturnType<typeof vi.fn<(key: string) => Promise<number>>>
  pipeline: ReturnType<typeof vi.fn>
  // cache-style surface (production lives in src/server/infra/redis/storage.ts)
  getItem: ReturnType<typeof vi.fn<(key: string) => Promise<unknown>>>
  setItem: ReturnType<typeof vi.fn>
  getItemRaw: ReturnType<typeof vi.fn<(key: string) => Promise<unknown>>>
  setItemRaw: ReturnType<typeof vi.fn>
  removeItem: ReturnType<typeof vi.fn<(key: string) => Promise<void>>>
  hasItem: ReturnType<typeof vi.fn<(key: string) => Promise<boolean>>>
  getKeys: ReturnType<typeof vi.fn<(prefix?: string) => Promise<string[]>>>
  // test inspection
  store: Map<string, Entry>
  /** Snapshot the current key→value map (after TTL expiration). */
  dump(): Record<string, unknown>
  /** Wipe every entry. */
  reset(): void
}

export function mockRedis(now: () => number = Date.now): MockRedis {
  const store = new Map<string, Entry>()

  function read(key: string): unknown {
    const entry = store.get(key)
    if (entry === undefined) {
      return null
    }
    if (isExpired(entry, now())) {
      store.delete(key)
      return null
    }
    return entry.value
  }

  function write(key: string, value: unknown, ttlSeconds?: number): void {
    store.set(key, {
      value,
      expiresAt: ttlSeconds === undefined ? null : now() + ttlSeconds * 1000,
    })
  }

  // --- ioredis-style ---
  // The real `set` accepts trailing args like `"EX", 60` and `"PXAT",
  // <epoch-ms>`. We honour both because that's the exact shape used in
  // `session.server.ts`; everything else is treated as a no-TTL set.
  const get = vi.fn(async (key: string) => {
    const value = read(key)
    if (value === null || value === undefined) {
      return null
    }
    return typeof value === 'string' ? value : JSON.stringify(value)
  })
  const set = vi.fn(async (key: string, value: string, ...rest: unknown[]) => {
    let ttlSeconds: number | undefined
    for (let i = 0; i < rest.length; i += 2) {
      const tag = rest[i]
      const arg = rest[i + 1]
      if (tag === 'EX' && typeof arg === 'number') {
        ttlSeconds = arg
      } else if (tag === 'PXAT' && typeof arg === 'number') {
        ttlSeconds = Math.max(0, Math.ceil((arg - now()) / 1000))
      }
    }
    write(key, value, ttlSeconds)
    return 'OK'
  })
  const del = vi.fn(async (key: string) => {
    const had = store.delete(key)
    return had ? 1 : 0
  })
  const incr = vi.fn(async (key: string) => {
    const raw = read(key)
    const next = (raw === null || raw === undefined ? 0 : Number(raw)) + 1
    const existing = store.get(key)
    store.set(key, {
      value: String(next),
      expiresAt: existing?.expiresAt ?? null,
    })
    return next
  })
  const expire = vi.fn(async (key: string, seconds: number) => {
    const entry = store.get(key)
    if (!entry) {
      return 0
    }
    entry.expiresAt = now() + seconds * 1000
    return 1
  })
  const ttl = vi.fn(async (key: string) => {
    const entry = store.get(key)
    if (!entry) {
      return -2
    }
    if (entry.expiresAt === null) {
      return -1
    }
    return Math.max(0, Math.ceil((entry.expiresAt - now()) / 1000))
  })
  // ioredis pipeline returns a builder whose `exec()` resolves to
  // `[err, result][]`. We approximate with synchronous queueing of get/set/del.
  const pipeline = vi.fn(() => {
    const ops: (() => Promise<unknown>)[] = []
    const builder = {
      get(key: string) {
        ops.push(() => get(key))
        return builder
      },
      set(key: string, value: string, ...rest: unknown[]) {
        ops.push(() => set(key, value, ...rest))
        return builder
      },
      del(key: string) {
        ops.push(() => del(key))
        return builder
      },
      incr(key: string) {
        ops.push(() => incr(key))
        return builder
      },
      async exec() {
        const results: [Error | null, unknown][] = []
        for (const op of ops) {
          try {
            results.push([null, await op()])
          } catch (error) {
            results.push([error as Error, null])
          }
        }
        return results
      },
    }
    return builder
  })

  // --- cache-style ---
  // Raw bytes go through `setItemRaw`/`getItemRaw` and JSON-encoded values
  // through `setItem`/`getItem`. We implement them as typed siblings on the
  // same store so a test can `getItem("k")` after a production write through
  // `setItem("k", ...)` and observe the round trip.
  const getItem = vi.fn(async (key: string) => {
    const raw = read(key)
    if (raw === null || raw === undefined) {
      return null
    }
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw)
      } catch {
        return raw
      }
    }
    return raw
  })
  const setItem = vi.fn(async (key: string, value: unknown, opts?: { ttl?: number }) => {
    write(key, JSON.stringify(value), opts?.ttl)
  })
  const getItemRaw = vi.fn(async (key: string) => read(key))
  const setItemRaw = vi.fn(async (key: string, value: unknown, opts?: { ttl?: number }) => {
    write(key, value, opts?.ttl)
  })
  const removeItem = vi.fn(async (key: string) => {
    store.delete(key)
  })
  const hasItem = vi.fn(async (key: string) => read(key) !== null)
  // `getKeys(prefix)` returns every key whose name starts with the
  // prefix string. We mirror that contract (prefix-match, not glob) so
  // test stubs of cache writers can iterate via the same API path the
  // production code uses.
  const getKeys = vi.fn(async (prefix?: string) => {
    const t = now()
    const out: string[] = []
    for (const [key, entry] of store.entries()) {
      if (isExpired(entry, t)) {
        continue
      }
      if (prefix === undefined || key.startsWith(prefix)) {
        out.push(key)
      }
    }
    return out
  })

  return {
    get,
    set,
    del,
    incr,
    expire,
    ttl,
    pipeline,
    getItem,
    setItem,
    getItemRaw,
    setItemRaw,
    removeItem,
    hasItem,
    getKeys,
    store,
    dump() {
      const out: Record<string, unknown> = {}
      const t = now()
      for (const [key, entry] of store.entries()) {
        if (!isExpired(entry, t)) {
          out[key] = entry.value
        }
      }
      return out
    },
    reset() {
      store.clear()
    },
  }
}
