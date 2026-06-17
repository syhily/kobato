import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createRedisCache } from '@/server/infra/cache/redis-cache'
import { storage } from '@/server/infra/redis/storage'

vi.mock('@/server/infra/cache/redis-cache', () => ({
  createRedisCache: vi.fn((key: string) => ({
    key,
    get: vi.fn(),
    set: vi.fn(),
    clear: vi.fn(),
  })),
}))

vi.mock('@/server/infra/redis/storage', () => ({
  storage: {
    getKeys: vi.fn(),
    removeItem: vi.fn().mockResolvedValue(undefined),
  },
}))

import { clearFeedCache, feedCacheFor } from '@/server/infra/cache/feed-cache'

describe('feedCacheFor', () => {
  it('returns a cache object for the filter', () => {
    const cache = feedCacheFor('posts')
    expect(cache).toHaveProperty('get')
    expect(cache).toHaveProperty('set')
    expect(cache).toHaveProperty('clear')
    expect(createRedisCache).toHaveBeenCalledWith('feed:xml:posts', { ttlMs: 300_000 })
  })
})

describe('clearFeedCache', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('removes all keys with the feed prefix', async () => {
    vi.mocked(storage.getKeys).mockResolvedValue(['feed:xml:a', 'feed:xml:b'])
    await clearFeedCache()
    expect(storage.getKeys).toHaveBeenCalledWith('feed:xml:')
    expect(storage.removeItem).toHaveBeenCalledWith('feed:xml:a')
    expect(storage.removeItem).toHaveBeenCalledWith('feed:xml:b')
  })

  it('does nothing when no keys match', async () => {
    vi.mocked(storage.getKeys).mockResolvedValue([])
    await clearFeedCache()
    expect(storage.removeItem).not.toHaveBeenCalled()
  })
})
