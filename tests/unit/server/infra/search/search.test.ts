import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { sql } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  selectLimit: vi.fn(),
  execute: vi.fn(),
  getItem: vi.fn(),
  setItem: vi.fn(),
  getKeys: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
}))

vi.mock('@/server/infra/cache/kv-store', () => ({
  getItem: mocks.getItem,
  setItem: mocks.setItem,
  getKeys: mocks.getKeys,
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

// A populated result cache means searchPosts never reaches the database
// beyond the generation read, so a chainable stub stands in for the
// Drizzle handle: `select().from().where().limit()` for the counter row,
// `execute()` for the atomic bump.
const db = {
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: mocks.selectLimit,
      })),
    })),
  })),
  execute: mocks.execute,
} as unknown as NodePgDatabase
const where = sql`true`

beforeEach(() => {
  mocks.selectLimit.mockReset().mockResolvedValue([])
  mocks.execute.mockReset().mockResolvedValue({ rows: [{ value: 1 }] })
  mocks.getItem.mockReset().mockResolvedValue(null)
  mocks.setItem.mockReset().mockResolvedValue(undefined)
  mocks.getKeys.mockReset().mockResolvedValue([])
  mocks.warn.mockClear()
  mocks.info.mockClear()
  __resetSearchCacheGenerationForTests()
})

describe('infra/search — invalidateSearchCache', () => {
  it('bumps the generation counter atomically instead of enumerating keys', async () => {
    await invalidateSearchCache(db)

    expect(mocks.execute).toHaveBeenCalledTimes(1)
    expect(mocks.getKeys).not.toHaveBeenCalled()
    expect(mocks.info).toHaveBeenCalledWith('invalidated search result cache', { generation: 1 })
  })

  it('resolves without throwing when the bump fails, logging one warning', async () => {
    mocks.execute.mockRejectedValue(new Error('db down'))

    await expect(invalidateSearchCache(db)).resolves.toBeUndefined()

    expect(mocks.warn).toHaveBeenCalledTimes(1)
    expect(mocks.warn.mock.calls[0]?.[0]).toBe('search result cache invalidation failed')
  })
})

describe('infra/search — cache generation stamp', () => {
  it('falls back to generation 0 when the counter row is missing, then recovers after a bump', async () => {
    mocks.getItem.mockResolvedValue(['slug-a'])

    const first = await searchPosts(db, where, 'hello', 10)
    expect(first.hits).toEqual(['slug-a'])
    expect(mocks.selectLimit).toHaveBeenCalledTimes(1)
    expect(mocks.getItem.mock.calls[0]?.[1]).toMatch(/^search-result:0:[0-9a-f]{64}$/)

    mocks.execute.mockResolvedValue({ rows: [{ value: 7 }] })
    await invalidateSearchCache(db)

    const second = await searchPosts(db, where, 'hello', 10)
    expect(second.hits).toEqual(['slug-a'])
    expect(mocks.getItem.mock.calls[1]?.[1]).toMatch(/^search-result:7:[0-9a-f]{64}$/)
  })

  it('does not cache a failed generation read — the next search retries', async () => {
    mocks.selectLimit.mockRejectedValueOnce(new Error('flaky'))
    mocks.getItem.mockResolvedValue(['slug-a'])

    await searchPosts(db, where, 'hello', 10)
    expect(mocks.getItem.mock.calls[0]?.[1]).toMatch(/^search-result:0:[0-9a-f]{64}$/)
    expect(mocks.warn).toHaveBeenCalledTimes(1)
    expect(mocks.warn.mock.calls[0]?.[0]).toBe('search cache generation read failed')

    mocks.selectLimit.mockResolvedValue([{ value: 3 }])
    await searchPosts(db, where, 'hello', 10)
    expect(mocks.getItem.mock.calls[1]?.[1]).toMatch(/^search-result:3:[0-9a-f]{64}$/)
  })
})
