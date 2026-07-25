import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createKvCache } from '@/server/infra/cache/kv-cache'
import { getKeys, removeItem } from '@/server/infra/cache/kv-store'

vi.mock('@/server/infra/cache/kv-cache', () => ({
  createKvCache: vi.fn((key: string) => ({
    key,
    get: vi.fn(),
    set: vi.fn(),
    clear: vi.fn(),
  })),
}))

vi.mock('@/server/infra/cache/kv-store', () => ({
  getKeys: vi.fn(),
  removeItem: vi.fn().mockResolvedValue(undefined),
}))

import { clearFeedCache, feedCacheFor } from '@/server/infra/cache/feed-cache'

// The db handle is only forwarded to the mocked kv-store — a stand-in is
// enough for the unit scope.
const db = {} as NodePgDatabase

describe('feedCacheFor', () => {
  it('returns a cache object for the filter', () => {
    const cache = feedCacheFor('posts')
    expect(cache).toHaveProperty('get')
    expect(cache).toHaveProperty('set')
    expect(cache).toHaveProperty('clear')
    expect(createKvCache).toHaveBeenCalledWith('feed:xml:posts', { ttlMs: 300_000 })
  })
})

describe('clearFeedCache', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('removes all keys with the feed prefix', async () => {
    vi.mocked(getKeys).mockResolvedValue(['feed:xml:a', 'feed:xml:b'])
    await clearFeedCache(db)
    expect(getKeys).toHaveBeenCalledWith(db, 'feed:xml:')
    expect(removeItem).toHaveBeenCalledWith(db, 'feed:xml:a')
    expect(removeItem).toHaveBeenCalledWith(db, 'feed:xml:b')
  })

  it('does nothing when no keys match', async () => {
    vi.mocked(getKeys).mockResolvedValue([])
    await clearFeedCache(db)
    expect(removeItem).not.toHaveBeenCalled()
  })
})
