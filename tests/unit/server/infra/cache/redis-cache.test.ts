import { beforeEach, describe, expect, it, vi } from 'vitest'

const redisData = new Map<string, string>()

const mockRedis = {
  get: vi.fn(async (key: string) => redisData.get(key) ?? null),
  set: vi.fn(async (key: string, value: string, ..._args: unknown[]) => {
    redisData.set(key, value)
  }),
  del: vi.fn(async (key: string) => {
    redisData.delete(key)
  }),
}

vi.mock('@/server/infra/redis/storage', async () => {
  const actual = await vi.importActual<typeof import('@/server/infra/redis/storage')>('@/server/infra/redis/storage')
  return {
    ...actual,
    redisInstance: () => mockRedis,
  }
})

import { createRedisCache } from '@/server/infra/cache/redis-cache'

describe('createRedisCache — superjson round-trip', () => {
  beforeEach(() => {
    redisData.clear()
    vi.clearAllMocks()
  })

  it('stores and retrieves plain objects', async () => {
    const cache = createRedisCache<{ name: string }>('test:plain', { ttlMs: 60_000 })
    await cache.set({ name: 'kobato' })
    const result = await cache.get()
    expect(result).toEqual({ name: 'kobato' })
  })

  it('round-trips Date values', async () => {
    const cache = createRedisCache<{ at: Date }>('test:date', { ttlMs: 60_000 })
    const now = new Date('2024-06-01T12:00:00.000Z')
    await cache.set({ at: now })
    const result = await cache.get()
    expect(result?.at).toEqual(now)
    expect(result?.at instanceof Date).toBe(true)
  })

  it('round-trips bigint values', async () => {
    const cache = createRedisCache<{ id: bigint }>('test:bigint', { ttlMs: 60_000 })
    await cache.set({ id: 9007199254740993n })
    const result = await cache.get()
    expect(result?.id).toBe(9007199254740993n)
  })

  it('returns null for cache misses', async () => {
    const cache = createRedisCache<unknown>('test:miss', { ttlMs: 60_000 })
    const result = await cache.get()
    expect(result).toBeNull()
  })

  it('evicts corrupted entries and returns null', async () => {
    redisData.set('test:corrupt', 'not-valid-json')
    const cache = createRedisCache<unknown>('test:corrupt', { ttlMs: 60_000 })
    const result = await cache.get()
    expect(result).toBeNull()
    expect(redisData.has('test:corrupt')).toBe(false)
  })

  it('clears entries', async () => {
    const cache = createRedisCache<string>('test:clear', { ttlMs: 60_000 })
    await cache.set('value')
    expect(await cache.get()).toBe('value')
    await cache.clear()
    expect(await cache.get()).toBeNull()
  })
})
