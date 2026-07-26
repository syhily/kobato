import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { describe, expect, it, vi } from 'vitest'

vi.mock('@/server/domains/posts/services/public-query', () => ({
  getClientPostsWithMetadata: vi.fn(async (_db: unknown, posts: unknown[]) => posts),
}))

vi.mock('@/server/render/seo/listing-seo', () => ({
  listingSeo: vi.fn(() => []),
}))

const { listingLoader } = await import('@/server/http/loaders/listing')

describe('listingLoader', () => {
  it('owns the stable offset when a tail merge expands the final page limit', async () => {
    const fetchPage = vi.fn(async () => [])

    await listingLoader({} as NodePgDatabase, {
      rawNum: '2',
      totalPosts: 13,
      pageSize: 5,
      mergeTailWhenLessThan: 4,
      fetchPage,
      rootPath: '/example',
      extra: undefined,
    })

    expect(fetchPage).toHaveBeenCalledOnce()
    expect(fetchPage).toHaveBeenCalledWith({ pageNum: 2, limit: 8, offset: 5 })
  })
})
