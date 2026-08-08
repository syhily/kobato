import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Database } from '@/server/infra/db/database'

import { seedMetric } from '#/_helpers/db'
import { regularSession } from '#/_helpers/session'

// The comments/critical split must keep `loadComments`, `queryLikes`, and
// `loadSidebarData` parallel: 50ms injected into each still finishes
// under ~100ms wall clock.

vi.mock('@/server/domains/comments/services/shared', () => ({
  ensureCommentPage: vi.fn(async () => seedMetric()),
}))

vi.mock('@/server/domains/comments/services/public-query', () => ({
  loadComments: vi.fn(),
  parseComments: vi.fn(async () => []),
}))
vi.mock('@/server/domains/comments/services/likes', () => ({ queryLikes: vi.fn(), startLikeTokenSweep: vi.fn() }))
vi.mock('@/server/http/loaders/sidebar', () => ({ loadSidebarData: vi.fn() }))

const commentShared = await import('@/server/domains/comments/services/shared')
const commentPublicQuery = await import('@/server/domains/comments/services/public-query')
const likes = await import('@/server/domains/comments/services/likes')
const sidebar = await import('@/server/http/loaders/sidebar')
const { loadCommentsAndItems, loadDetailPageCritical } = await import('@/server/http/loaders/comments')

const POST_TIMING = { type: 'post' as const, ownerId: 1 }
const POST_EMPTY = { type: 'post' as const, ownerId: 2 }
const POST_ONE_UPSERT = { type: 'post' as const, ownerId: 3 }

const mockDb = {} as Database

function delay<T>(value: T, ms: number): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms))
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(commentShared.ensureCommentPage).mockResolvedValue(seedMetric())
})

describe('services/comments/page-data — comments/critical split', () => {
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
    await Promise.all([
      loadCommentsAndItems(mockDb, regularSession(), POST_TIMING),
      loadDetailPageCritical(mockDb, regularSession(), POST_TIMING),
    ])
    const elapsed = Date.now() - start

    expect(elapsed).toBeLessThan(100)
  })

  it('skips parseComments entirely when there are zero comments (short-circuit)', async () => {
    vi.mocked(commentPublicQuery.loadComments).mockResolvedValue({
      count: 0,
      roots_count: 0,
      comments: [],
    })

    const { commentItems } = await loadCommentsAndItems(mockDb, regularSession(), POST_EMPTY)

    expect(commentItems).toEqual([])
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
    const session = regularSession()

    await loadDetailPageCritical(mockDb, session, POST_ONE_UPSERT)
    await loadCommentsAndItems(mockDb, session, POST_ONE_UPSERT)

    expect(commentShared.ensureCommentPage).toHaveBeenCalledOnce()
    expect(commentPublicQuery.loadComments).toHaveBeenCalledWith(mockDb, session, POST_ONE_UPSERT, 0, {
      ensurePage: false,
    })
  })
})
