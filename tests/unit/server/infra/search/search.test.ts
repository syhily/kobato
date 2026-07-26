import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { sql } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  through: vi.fn(),
  getCounter: vi.fn(),
  runLikeSearch: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}))

vi.mock('@/server/infra/cache/registry', () => ({
  through: mocks.through,
  getCounter: mocks.getCounter,
}))

vi.mock('@/server/infra/search/openai', () => ({
  generateEmbedding: vi.fn(async () => null),
}))

vi.mock('@/server/infra/search/like', () => ({
  likeCacheKeyParts: vi.fn((_settings: unknown, query: string) => ['like', query]),
  runLikeSearch: mocks.runLikeSearch,
}))

vi.mock('@/server/infra/search/trgm', () => ({
  trgmCacheKeyParts: vi.fn((_settings: unknown, query: string) => ['trgm', query, '0.3']),
  runTrgmSearch: vi.fn(async () => ['slug-trgm']),
}))

vi.mock('@/server/infra/search/vector', () => ({
  vectorCacheKeyParts: vi.fn((_settings: unknown, query: string) => ['vector', query]),
  runVectorSearch: vi.fn(async () => ['slug-vector']),
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

import { searchPosts } from '@/server/infra/search/search'

// The cache module is mocked, so the Drizzle handle only serves the trgm
// availability probe (`db.execute`).
const db = {
  execute: vi.fn(async () => ({ rows: [{ extname: 'pg_trgm' }] })),
} as unknown as NodePgDatabase
const where = sql`true`

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getCounter.mockResolvedValue(7)
  mocks.through.mockResolvedValue(['slug-a', 'slug-b', 'slug-c'])
  mocks.runLikeSearch.mockResolvedValue(['slug-like'])
})

describe('infra/search — searchPosts', () => {
  it('reads the generation counter and caches through the searchResult declaration', async () => {
    const result = await searchPosts(db, where, 'hello', 10)

    expect(mocks.getCounter).toHaveBeenCalledWith(db, 'searchResult')
    expect(mocks.through).toHaveBeenCalledTimes(1)
    const [dbArg, id, params, loader, options] = mocks.through.mock.calls[0] as unknown as [
      unknown,
      string,
      { generation: number; parts: string[] },
      () => Promise<string[]>,
      { onHit?: (value: string[]) => void },
    ]
    expect(dbArg).toBe(db)
    expect(id).toBe('searchResult')
    expect(params.generation).toBe(7)
    // No settings bundle is hydrated in the unit scope, so the infra
    // defaults apply — LIKE mode folds only the mode and the query in.
    expect(params.parts).toEqual(['like', 'hello'])
    expect(loader).toBeTypeOf('function')
    expect(options.onHit).toBeTypeOf('function')
    expect(result.hits).toEqual(['slug-a', 'slug-b', 'slug-c'])
  })

  it('paginates over the cached slug list', async () => {
    const result = await searchPosts(db, where, 'hello', 2, 2)

    expect(result.hits).toEqual(['slug-c'])
    expect(result.page).toBe(2)
    expect(result.totalPages).toBe(2)
  })

  it('runs the loader through to the active mode on a cache miss', async () => {
    mocks.through.mockImplementation(
      async (_db: unknown, _id: unknown, _params: unknown, loader: () => Promise<string[]>) => loader(),
    )

    const result = await searchPosts(db, where, 'hello', 10)

    expect(mocks.runLikeSearch).toHaveBeenCalledTimes(1)
    expect(result.hits).toEqual(['slug-like'])
  })

  it('logs a cache hit through the onHit callback', async () => {
    await searchPosts(db, where, 'hello', 10)

    const options = (
      mocks.through.mock.calls[0] as unknown as [
        unknown,
        unknown,
        unknown,
        unknown,
        {
          onHit: (value: string[]) => void
        },
      ]
    )[4]
    options.onHit(['slug-a'])
    expect(mocks.info).toHaveBeenCalledWith('Search result cache hit', { query: 'hello', total: 1 })
  })

  it('short-circuits an empty query without touching the cache', async () => {
    const result = await searchPosts(db, where, '   ', 10)

    expect(result).toEqual({ hits: [], page: 1, totalPages: 0 })
    expect(mocks.getCounter).not.toHaveBeenCalled()
    expect(mocks.through).not.toHaveBeenCalled()
  })
})
