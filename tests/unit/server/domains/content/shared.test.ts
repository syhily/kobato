import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { clearContentCaches } from '@/server/domains/content/shared'
import { clearFeedCache } from '@/server/infra/cache/feed-cache'
import { clearSitemapCache } from '@/server/infra/cache/sitemap-cache'

vi.mock('@/server/infra/cache/feed-cache', () => ({
  clearFeedCache: vi.fn(),
}))
vi.mock('@/server/infra/cache/sitemap-cache', () => ({
  clearSitemapCache: vi.fn(),
}))

// The db handle is only forwarded to the mocked clear helpers — a stand-in
// is enough for the unit scope.
const db = {} as NodePgDatabase

describe('clearContentCaches', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(clearFeedCache).mockResolvedValue(undefined)
    vi.mocked(clearSitemapCache).mockResolvedValue(undefined)
  })

  it('clears feed and sitemap caches for posts', async () => {
    await clearContentCaches(db, 'post', 42n)

    expect(clearFeedCache).toHaveBeenCalledTimes(1)
    expect(clearSitemapCache).toHaveBeenCalledTimes(1)
  })

  it('clears only the sitemap cache for pages', async () => {
    await clearContentCaches(db, 'page', 42n)

    expect(clearSitemapCache).toHaveBeenCalledTimes(1)
    expect(clearFeedCache).not.toHaveBeenCalled()
  })

  it('logs but does not throw when feed cache clearing fails for posts', async () => {
    vi.mocked(clearFeedCache).mockRejectedValue(new Error('feed down'))

    await expect(clearContentCaches(db, 'post', 42n)).resolves.toBeUndefined()

    expect(clearSitemapCache).toHaveBeenCalledTimes(1)
  })

  it('logs but does not throw when sitemap cache clearing fails', async () => {
    vi.mocked(clearSitemapCache).mockRejectedValue(new Error('sitemap down'))

    await expect(clearContentCaches(db, 'page', 42n)).resolves.toBeUndefined()
  })
})
