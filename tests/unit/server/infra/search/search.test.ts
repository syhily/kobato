import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { sql } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  redisGet: vi.fn(),
  redisIncr: vi.fn(),
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  getKeys: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
}))

vi.mock('@/server/infra/redis/storage', () => ({
  storage: {
    getItem: mocks.getItem,
    setItem: mocks.setItem,
    removeItem: mocks.removeItem,
    getKeys: mocks.getKeys,
  },
  redisInstance: () => ({ get: mocks.redisGet, incr: mocks.redisIncr }),
}))

vi.mock('@/server/infra/search/openai', () => ({
  generateEmbedding: vi.fn(async () => null),
}))

vi.mock('@/server/infra/logger', () => {
  interface LoggerStub {
    debug: ReturnType<typeof vi.fn>
    info: ReturnType<typeof vi.fn>
    warn: ReturnType<typeof vi.fn>
    error: ReturnType<typeof vi.fn>
    fatal: ReturnType<typeof vi.fn>
    child: () => LoggerStub
    withScope: () => LoggerStub
  }
  const makeStub = (): LoggerStub => ({
    debug: vi.fn(),
    info: mocks.info,
    warn: mocks.warn,
    error: vi.fn(),
    fatal: vi.fn(),
    child: () => makeStub(),
    withScope: () => makeStub(),
  })
  return { getLogger: () => makeStub(), logger: makeStub() }
})

const { searchPosts, invalidateSearchCache, __resetSearchCacheGenerationForTests } =
  await import('@/server/infra/search/search')

// A populated result cache means searchPosts never reaches the database,
// so a bare stub stands in for the Drizzle handle.
const db = {} as NodePgDatabase
const where = sql`true`

beforeEach(() => {
  mocks.redisGet.mockReset().mockResolvedValue(null)
  mocks.redisIncr.mockReset().mockResolvedValue(1)
  mocks.getItem.mockReset().mockResolvedValue(null)
  mocks.setItem.mockReset().mockResolvedValue(undefined)
  mocks.removeItem.mockReset().mockResolvedValue(undefined)
  mocks.getKeys.mockReset().mockResolvedValue([])
  mocks.warn.mockClear()
  mocks.info.mockClear()
  __resetSearchCacheGenerationForTests()
})

describe('infra/search — invalidateSearchCache', () => {
  it('bumps the generation counter instead of enumerating keys', async () => {
    await invalidateSearchCache()

    expect(mocks.redisIncr).toHaveBeenCalledWith('search-result:generation')
    expect(mocks.getKeys).not.toHaveBeenCalled()
    expect(mocks.info).toHaveBeenCalledWith('invalidated search result cache', { generation: 1 })
  })

  it('resolves without throwing when Redis fails, logging one warning', async () => {
    mocks.redisIncr.mockRejectedValue(new Error('redis down'))

    await expect(invalidateSearchCache()).resolves.toBeUndefined()

    expect(mocks.warn).toHaveBeenCalledTimes(1)
    expect(mocks.warn.mock.calls[0]?.[0]).toBe('search result cache invalidation failed')
  })
})

describe('infra/search — cache generation stamp', () => {
  it('falls back to generation 0 when the counter key is missing, then recovers after a bump', async () => {
    mocks.getItem.mockResolvedValue(JSON.stringify(['slug-a']))

    const first = await searchPosts(db, where, 'hello', 10)
    expect(first.hits).toEqual(['slug-a'])
    expect(mocks.redisGet).toHaveBeenCalledWith('search-result:generation')
    expect(mocks.getItem.mock.calls[0]?.[0]).toMatch(/^search-result:0:[0-9a-f]{64}$/)

    mocks.redisIncr.mockResolvedValue(7)
    await invalidateSearchCache()

    const second = await searchPosts(db, where, 'hello', 10)
    expect(second.hits).toEqual(['slug-a'])
    expect(mocks.getItem.mock.calls[1]?.[0]).toMatch(/^search-result:7:[0-9a-f]{64}$/)
  })

  it('does not cache a failed generation read — the next search retries', async () => {
    mocks.redisGet.mockRejectedValueOnce(new Error('flaky'))
    mocks.getItem.mockResolvedValue(JSON.stringify(['slug-a']))

    await searchPosts(db, where, 'hello', 10)
    expect(mocks.getItem.mock.calls[0]?.[0]).toMatch(/^search-result:0:[0-9a-f]{64}$/)
    expect(mocks.warn).toHaveBeenCalledTimes(1)
    expect(mocks.warn.mock.calls[0]?.[0]).toBe('search cache generation read failed')

    mocks.redisGet.mockResolvedValue('3')
    await searchPosts(db, where, 'hello', 10)
    expect(mocks.getItem.mock.calls[1]?.[0]).toMatch(/^search-result:3:[0-9a-f]{64}$/)
  })
})
