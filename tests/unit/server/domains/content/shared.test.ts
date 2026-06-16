import { beforeEach, describe, expect, it, vi } from 'vitest'

import { clearContentCaches } from '@/server/domains/content/shared'
import { clearPagesCache } from '@/server/domains/pages/services/shared'
import { clearPostMetasCache } from '@/server/domains/posts/services/shared'
import { clearFeedCache } from '@/server/infra/cache/feed-cache'
import { clearSitemapCache } from '@/server/infra/cache/sitemap-cache'

vi.mock('@/server/domains/posts/services/shared', () => ({
  clearPostMetasCache: vi.fn(),
}))
vi.mock('@/server/domains/pages/services/shared', () => ({
  clearPagesCache: vi.fn(),
}))
vi.mock('@/server/infra/cache/feed-cache', () => ({
  clearFeedCache: vi.fn(),
}))
vi.mock('@/server/infra/cache/sitemap-cache', () => ({
  clearSitemapCache: vi.fn(),
}))

describe('clearContentCaches', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(clearFeedCache).mockResolvedValue(undefined)
    vi.mocked(clearSitemapCache).mockResolvedValue(undefined)
  })

  it('clears post metas, feed, and sitemap caches for posts', async () => {
    vi.mocked(clearPostMetasCache).mockResolvedValue(undefined)

    await clearContentCaches('post', 42n)

    expect(clearPostMetasCache).toHaveBeenCalledTimes(1)
    expect(clearFeedCache).toHaveBeenCalledTimes(1)
    expect(clearSitemapCache).toHaveBeenCalledTimes(1)
    expect(clearPagesCache).not.toHaveBeenCalled()
  })

  it('clears pages and sitemap caches for pages', async () => {
    vi.mocked(clearPagesCache).mockResolvedValue(undefined)

    await clearContentCaches('page', 42n)

    expect(clearPagesCache).toHaveBeenCalledTimes(1)
    expect(clearSitemapCache).toHaveBeenCalledTimes(1)
    expect(clearPostMetasCache).not.toHaveBeenCalled()
    expect(clearFeedCache).not.toHaveBeenCalled()
  })

  it('logs but does not throw when feed cache clearing fails for posts', async () => {
    vi.mocked(clearPostMetasCache).mockResolvedValue(undefined)
    vi.mocked(clearFeedCache).mockRejectedValue(new Error('feed down'))

    await expect(clearContentCaches('post', 42n)).resolves.toBeUndefined()

    expect(clearPostMetasCache).toHaveBeenCalledTimes(1)
    expect(clearSitemapCache).toHaveBeenCalledTimes(1)
  })

  it('logs but does not throw when sitemap cache clearing fails', async () => {
    vi.mocked(clearPagesCache).mockResolvedValue(undefined)
    vi.mocked(clearSitemapCache).mockRejectedValue(new Error('sitemap down'))

    await expect(clearContentCaches('page', 42n)).resolves.toBeUndefined()

    expect(clearPagesCache).toHaveBeenCalledTimes(1)
  })
})
