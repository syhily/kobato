import { beforeEach, describe, expect, it, vi } from 'vitest'

import { seedMetric } from './_helpers/db'
import { regularSession } from './_helpers/session'

// `loadDetailPageData` must fan out `loadComments`, `queryLikes`, and
// `loadSidebarData` in parallel — they're independent and each is
// individually slow. This test injects 50ms of artificial latency into all
// three paths and asserts the wall clock stays below ~100ms (≈ slowest
// dependency + scheduler jitter), which is impossible if any pair were
// serialised.

vi.mock('@/server/domains/comments/services/shared', () => ({
  ensureCommentPage: vi.fn(async () => seedMetric()),
}))

vi.mock('@/server/domains/comments/services/public-query', () => ({
  loadComments: vi.fn(),
  parseComments: vi.fn(async () => []),
}))
vi.mock('@/server/domains/comments/likes', () => ({ queryLikes: vi.fn() }))
vi.mock('@/server/http/loaders/sidebar', () => ({ loadSidebarData: vi.fn() }))
vi.mock('@/server/domains/analytics/pv-batcher', () => ({ bumpPageView: vi.fn() }))

const commentShared = await import('@/server/domains/comments/services/shared')
const commentPublicQuery = await import('@/server/domains/comments/services/public-query')
const likes = await import('@/server/domains/comments/likes')
const sidebar = await import('@/server/http/loaders/sidebar')
const metrics = await import('@/server/domains/analytics/pv-batcher')
const { loadDetailPageData } = await import('@/server/http/loaders/comments')

const POST_TIMING = { type: 'post' as const, ownerId: 1n }
const POST_EMPTY = { type: 'post' as const, ownerId: 2n }
const POST_ONE_UPSERT = { type: 'post' as const, ownerId: 3n }
const POST_NO_TRACK = { type: 'post' as const, ownerId: 4n }

function delay<T>(value: T, ms: number): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms))
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(commentShared.ensureCommentPage).mockResolvedValue(seedMetric())
})

describe('services/comments/page-data — loadDetailPageData', () => {
  it('loadComments + queryLikes + loadSidebarData run in parallel (≤100ms wall clock for 50ms each)', async () => {
    vi.mocked(commentPublicQuery.loadComments).mockImplementation(() =>
      delay({ count: 0, roots_count: 0, comments: [] }, 50),
    )
    vi.mocked(likes.queryLikes).mockImplementation(() => delay(0, 50))
    vi.mocked(sidebar.loadSidebarData).mockImplementation(() =>
      delay(
        {
          recentPosts: [],
          recentComments: [],
          pendingComments: [],
          tags: [],
          isAdmin: false,
        } as unknown as Awaited<ReturnType<typeof sidebar.loadSidebarData>>,
        50,
      ),
    )

    const start = Date.now()
    await loadDetailPageData(regularSession(), POST_TIMING)
    const elapsed = Date.now() - start

    expect(elapsed).toBeLessThan(100)
  })

  it('skips parseComments entirely when there are zero comments (short-circuit)', async () => {
    vi.mocked(commentPublicQuery.loadComments).mockResolvedValue({
      count: 0,
      roots_count: 0,
      comments: [],
    })
    vi.mocked(likes.queryLikes).mockResolvedValue(0)
    vi.mocked(sidebar.loadSidebarData).mockResolvedValue({
      recentPosts: [],
      recentComments: [],
      pendingComments: [],
      tags: [],
      isAdmin: false,
    } as unknown as Awaited<ReturnType<typeof sidebar.loadSidebarData>>)

    const result = await loadDetailPageData(regularSession(), POST_EMPTY)

    expect(result.commentItems).toEqual([])
    expect(commentPublicQuery.parseComments).not.toHaveBeenCalled()
  })

  it('ensures the page row once, then loads comments without a second upsert', async () => {
    vi.mocked(commentPublicQuery.loadComments).mockResolvedValue({
      count: 0,
      roots_count: 0,
      comments: [],
    })
    vi.mocked(likes.queryLikes).mockResolvedValue(0)
    vi.mocked(sidebar.loadSidebarData).mockResolvedValue({
      recentPosts: [],
      recentComments: [],
      pendingComments: [],
      tags: [],
      isAdmin: false,
    } as unknown as Awaited<ReturnType<typeof sidebar.loadSidebarData>>)

    await loadDetailPageData(regularSession(), POST_ONE_UPSERT)

    expect(commentShared.ensureCommentPage).toHaveBeenCalledOnce()
    expect(commentPublicQuery.loadComments).toHaveBeenCalledWith(expect.anything(), POST_ONE_UPSERT, 0, {
      ensurePage: false,
    })
  })

  it('skips view increments when caller disables tracking', async () => {
    vi.mocked(commentPublicQuery.loadComments).mockResolvedValue({
      count: 0,
      roots_count: 0,
      comments: [],
    })
    vi.mocked(likes.queryLikes).mockResolvedValue(0)
    vi.mocked(sidebar.loadSidebarData).mockResolvedValue({
      recentPosts: [],
      recentComments: [],
      pendingComments: [],
      tags: [],
      isAdmin: false,
    } as unknown as Awaited<ReturnType<typeof sidebar.loadSidebarData>>)

    await loadDetailPageData(regularSession(), POST_NO_TRACK, { trackView: false })

    expect(metrics.bumpPageView).not.toHaveBeenCalled()
  })
})
