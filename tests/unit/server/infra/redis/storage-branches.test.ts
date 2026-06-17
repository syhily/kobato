import { beforeEach, describe, expect, it, vi } from 'vitest'

// vi.mock factories are hoisted above every top-level statement, so the
// shared state the mock reads from must itself be hoisted. Use
// vi.hoisted to allocate the listeners/calls map before the mock factory
// runs.
const state = vi.hoisted(() => {
  return {
    listeners: {} as Record<string, Array<(...args: unknown[]) => void>>,
    calls: {
      get: vi.fn<(key: string) => Promise<string | null>>(),
      getBuffer: vi.fn<(key: string) => Promise<Buffer | null>>(),
      set: vi.fn<(key: string, value: unknown, ...rest: unknown[]) => Promise<unknown>>(),
      del: vi.fn<(...keys: string[]) => Promise<unknown>>(),
      mget: vi.fn<(...keys: string[]) => Promise<(string | null)[]>>(),
      scan: vi.fn<(...args: unknown[]) => Promise<[string, string[]]>>(),
      quit: vi.fn<() => Promise<unknown>>(),
      ping: vi.fn<() => Promise<string>>(),
    },
  }
})

// Mock ioredis with a richer client than the existing storage.test.ts so
// we can drive the raw, ttl, multi-key and circuit-breaker branches.
vi.mock('ioredis', () => ({
  Redis: class MockRedis {
    constructor() {
      // lazyConnect: true — no connection here.
    }
    on(event: string, cb: (...args: unknown[]) => void): this {
      ;(state.listeners[event] ??= []).push(cb)
      return this
    }
    async get(key: string) {
      return state.calls.get(key)
    }
    async getBuffer(key: string) {
      return state.calls.getBuffer(key)
    }
    async set(key: string, value: unknown, ...rest: unknown[]) {
      return state.calls.set(key, value, ...rest)
    }
    async del(...keys: string[]) {
      return state.calls.del(...keys)
    }
    async mget(...keys: string[]) {
      return state.calls.mget(...keys)
    }
    async scan(...args: unknown[]) {
      return state.calls.scan(...args)
    }
    async quit() {
      return state.calls.quit()
    }
    async ping() {
      return state.calls.ping()
    }
  },
}))

function emit(event: string, ...args: unknown[]): void {
  for (const cb of state.listeners[event] ?? []) {
    cb(...args)
  }
}

import { REDIS_KEY_PREFIX } from '@/server/infra/env'
import { closeRedis, isRedisHealthy, pingRedis, redisInstance, storage } from '@/server/infra/redis/storage'

const calls = state.calls

describe('redis storage — raw item API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('getItemRaw returns the buffer verbatim when present', async () => {
    const buf = Buffer.from([1, 2, 3, 4])
    calls.getBuffer.mockResolvedValue(buf)

    const result = await storage.getItemRaw<Buffer>('raw-key')

    expect(result).toBe(buf)
    expect(calls.getBuffer).toHaveBeenCalledWith('raw-key')
  })

  it('getItemRaw returns null when the key is missing', async () => {
    calls.getBuffer.mockResolvedValue(null)

    const result = await storage.getItemRaw<Buffer>('absent')

    expect(result).toBeNull()
  })

  it('setItemRaw forwards the value without ttl', async () => {
    calls.set.mockResolvedValue('OK')

    await storage.setItemRaw('raw-key', Buffer.from('hi'))

    expect(calls.set).toHaveBeenCalledWith('raw-key', Buffer.from('hi'))
  })

  it('setItemRaw forwards ttl through the EX option', async () => {
    calls.set.mockResolvedValue('OK')

    await storage.setItemRaw('raw-key', 'payload', { ttl: 90 })

    expect(calls.set).toHaveBeenCalledWith('raw-key', 'payload', 'EX', 90)
  })
})

describe('redis storage — typed setItem with ttl', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('setItem forwards ttl through the EX option', async () => {
    calls.set.mockResolvedValue('OK')

    await storage.setItem('k', { a: 1 }, { ttl: 7 })

    expect(calls.set).toHaveBeenCalledWith('k', expect.any(String), 'EX', 7)
  })

  it('setItem forwards the payload without ttl when omitted', async () => {
    calls.set.mockResolvedValue('OK')

    await storage.setItem('k', { a: 1 })

    // The payload is a stringified superjson envelope; just assert the
    // ttl option was not appended.
    expect(calls.set).toHaveBeenCalledWith('k', expect.any(String))
  })
})

describe('redis storage — removeItem', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('forwards to redis.del', async () => {
    calls.del.mockResolvedValue(1)

    await storage.removeItem('foo')

    expect(calls.del).toHaveBeenCalledWith('foo')
  })
})

describe('redis storage — getItems', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns an empty array for an empty key list (no redis call)', async () => {
    const result = await storage.getItems<string>([])

    expect(result).toEqual([])
    expect(calls.mget).not.toHaveBeenCalled()
  })

  it('parses each value via superjson, returning null for missing keys', async () => {
    // superjson serialises plain objects as `{"json":{...}}`.
    calls.mget.mockResolvedValue([null, '{"json":{"a":1}}'])

    const result = await storage.getItems<{ a: number }>(['k1', 'k2'])

    expect(result).toEqual([
      { key: 'k1', value: null },
      { key: 'k2', value: { a: 1 } },
    ])
  })

  it('returns null on parse failure (defensive branch)', async () => {
    calls.mget.mockResolvedValue(['not-valid-superjson'])

    const result = await storage.getItems<unknown>(['bad'])

    expect(result).toEqual([{ key: 'bad', value: null }])
  })
})

describe('redis storage — getKeys scan pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('strips the configured REDIS_KEY_PREFIX from every returned key', async () => {
    // Cursor returns once: 0 -> 0 (single batch). Use whatever prefix
    // the env snapshot reports for THIS worker (vitest sets
    // REDIS_KEY_PREFIX = `test:w<workerId>:` per worker).
    const prefix = REDIS_KEY_PREFIX ?? ''
    calls.scan.mockResolvedValue(['0', [`${prefix}foo`, `${prefix}bar`]])

    const keys = await storage.getKeys('my-prefix:')

    // Each returned key should have the env prefix stripped, while the
    // caller-supplied `prefix` filter is preserved verbatim.
    expect(keys).toEqual(['foo', 'bar'])
    // The MATCH pattern passed to SCAN must include both the env prefix
    // and the caller's filter.
    const scanArgs = calls.scan.mock.calls[0]
    expect(scanArgs[0]).toBe('0')
    expect(scanArgs[1]).toBe('MATCH')
    expect(scanArgs[2]).toBe(`${prefix}my-prefix:*`)
  })

  it('aborts when exceeding maxCount (defensive branch)', async () => {
    // First cursor returns more keys than maxCount, second never runs.
    const prefix = REDIS_KEY_PREFIX ?? ''
    const bigBatch = Array.from({ length: 5 }, (_, i) => `${prefix}k${i}`)
    calls.scan.mockResolvedValue(['0', bigBatch])

    const keys = await storage.getKeys(undefined, 2)

    expect(keys.length).toBe(5)
    expect(calls.scan).toHaveBeenCalledTimes(1)
  })

  it('uses a wildcard pattern when no prefix is supplied', async () => {
    calls.scan.mockResolvedValue(['0', []])

    await storage.getKeys()

    const pattern = calls.scan.mock.calls[0][2] as string
    expect(pattern.endsWith('*')).toBe(true)
  })
})

describe('redis storage — circuit breaker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    calls.ping.mockResolvedValue('PONG')
  })

  it('redisInstance returns the shared client', () => {
    const a = redisInstance()
    const b = redisInstance()
    expect(a).toBe(b)
  })

  it('isRedisHealthy is true while no errors have fired', () => {
    expect(isRedisHealthy()).toBe(true)
  })

  it('records failures and opens the circuit after the threshold', async () => {
    // Emit 5 errors via the mocked 'error' listener; each one bumps the
    // internal failure counter, and the 5th trips the breaker.
    for (let i = 0; i < 5; i += 1) {
      emit('error', new Error('boom'))
    }
    expect(isRedisHealthy()).toBe(false)
  })

  it('closes the circuit on a successful ping', async () => {
    // Force the breaker open, then ping to record success.
    for (let i = 0; i < 5; i += 1) {
      emit('error', new Error('boom'))
    }
    expect(isRedisHealthy()).toBe(false)

    const ok = await pingRedis()
    expect(ok).toBe(true)
    expect(isRedisHealthy()).toBe(true)
  })

  it('pingRedis records a failure when redis does not answer PONG', async () => {
    calls.ping.mockResolvedValue('NOT-PONG')

    const ok = await pingRedis()
    expect(ok).toBe(false)
  })

  it('pingRedis records a failure when ping throws', async () => {
    calls.ping.mockRejectedValue(new Error('ECONNREFUSED'))

    const ok = await pingRedis()
    expect(ok).toBe(false)
  })

  it('a "ready" event resets the failure counter', () => {
    // Trip the breaker first.
    for (let i = 0; i < 5; i += 1) {
      emit('error', new Error('boom'))
    }
    expect(isRedisHealthy()).toBe(false)

    // The ready listener should close the circuit immediately.
    emit('ready')
    expect(isRedisHealthy()).toBe(true)
  })

  it('closeRedis calls quit on the underlying client', async () => {
    calls.quit.mockResolvedValue('OK')

    await closeRedis()

    expect(calls.quit).toHaveBeenCalled()
  })
})
