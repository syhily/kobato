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

import { storage } from '@/server/infra/redis/storage'

describe('redis storage — superjson round-trip', () => {
  beforeEach(() => {
    redisData.clear()
    vi.clearAllMocks()
  })

  it('round-trips plain objects', async () => {
    await storage.setItem('plain', { foo: 'bar', count: 42 })
    const result = await storage.getItem<Record<string, unknown>>('plain')
    expect(result).toEqual({ foo: 'bar', count: 42 })
  })

  it('round-trips Date objects', async () => {
    const now = new Date('2024-06-01T12:00:00.000Z')
    await storage.setItem('date', { createdAt: now })
    const result = await storage.getItem<{ createdAt: Date }>('date')
    expect(result?.createdAt).toEqual(now)
    expect(result?.createdAt instanceof Date).toBe(true)
  })

  it('round-trips bigint values', async () => {
    await storage.setItem('bigint', { id: 12345678901234567890n })
    const result = await storage.getItem<{ id: bigint }>('bigint')
    expect(result?.id).toBe(12345678901234567890n)
  })

  it('round-trips undefined fields', async () => {
    await storage.setItem('undefined', { a: 1, b: undefined, c: 3 })
    const result = await storage.getItem<{ a: number; b: undefined; c: number }>('undefined')
    expect(result).toEqual({ a: 1, b: undefined, c: 3 })
  })

  it('returns null for missing keys', async () => {
    const result = await storage.getItem<unknown>('missing')
    expect(result).toBeNull()
  })

  it('returns null for corrupted values', async () => {
    redisData.set('corrupt', 'not-valid-superjson')
    const result = await storage.getItem<unknown>('corrupt')
    expect(result).toBeNull()
  })
})
