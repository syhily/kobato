import type { Database } from '@kobato/db/database'

import { seedMetric } from '@kobato/server/tests/utils/db'
import { regularSession } from '@kobato/server/tests/utils/session'
import { TEST_BLOG_SETTINGS_BUNDLE } from '@kobato/settings/tests/utils/blog-settings'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const commentShared = await import('@kobato/server/domains/comments/services/shared')
const commentPublicQuery = await import('@kobato/server/domains/comments/services/public-query')
const likes = await import('@kobato/server/domains/comments/services/likes')
const sidebar = await import('@kobato/server/http/loaders/sidebar')

// Loader composition is pinned through spies so delay injection can prove
// parallelism; the underlying services are covered by their own suites.
const ensureCommentPage = vi.spyOn(commentShared, 'ensureCommentPage').mockImplementation(async () => seedMetric())
const loadCommentsSpy = vi.spyOn(commentPublicQuery, 'loadComments')
vi.spyOn(commentPublicQuery, 'parseComments').mockImplementation(async () => [])
const commentThreadFingerprint = vi
  .spyOn(commentPublicQuery, 'commentThreadFingerprint')
  .mockImplementation(async () => 'comments-fingerprint')
const queryLikes = vi.spyOn(likes, 'queryLikes')
vi.spyOn(likes, 'startLikeTokenSweep')
const loadSidebarData = vi.spyOn(sidebar, 'loadSidebarData')
const { loadCommentsAndItems, loadDetailPageCritical } = await import('@kobato/server/http/loaders/comments')

afterAll(() => {
  vi.restoreAllMocks()
})

const POST_TIMING = { type: 'post' as const, ownerId: 1 }
const POST_EMPTY = { type: 'post' as const, ownerId: 2 }
const POST_ONE_UPSERT = { type: 'post' as const, ownerId: 3 }

const mockDb = {} as Database

function delay<T>(value: T, ms: number): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms))
}

beforeEach(() => {
  vi.clearAllMocks()
  ensureCommentPage.mockResolvedValue(seedMetric())
})

describe('services/comments/page-data — comments/critical split', () => {
  it('loadComments + queryLikes + loadSidebarData + fingerprint run in parallel (≤100ms wall clock for 50ms each)', async () => {
    loadCommentsSpy.mockImplementation(() => delay({ count: 0, roots_count: 0, comments: [] }, 50))
    queryLikes.mockImplementation(() => delay(0, 50))
    commentThreadFingerprint.mockImplementation(() => delay('comments-fingerprint', 50))
    loadSidebarData.mockImplementation(() =>
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
      loadDetailPageCritical(mockDb, regularSession(), POST_TIMING, TEST_BLOG_SETTINGS_BUNDLE),
    ])
    const elapsed = Date.now() - start

    expect(elapsed).toBeLessThan(100)
  })

  it('skips parseComments entirely when there are zero comments (short-circuit)', async () => {
    loadCommentsSpy.mockResolvedValue({
      count: 0,
      roots_count: 0,
      comments: [],
    })

    const { commentItems } = await loadCommentsAndItems(mockDb, regularSession(), POST_EMPTY)

    expect(commentItems).toEqual([])
    expect(commentPublicQuery.parseComments).not.toHaveBeenCalled()
  })

  it('ensures the page row once, then loads comments without a second upsert', async () => {
    loadCommentsSpy.mockResolvedValue({
      count: 0,
      roots_count: 0,
      comments: [],
    })
    queryLikes.mockResolvedValue(0)
    loadSidebarData.mockResolvedValue({
      recentPosts: [],
      recentComments: [],
      pendingComments: [],
      tags: [],
      isAdmin: false,
    } as unknown as Awaited<ReturnType<typeof sidebar.loadSidebarData>>)
    const session = regularSession()

    await loadDetailPageCritical(mockDb, session, POST_ONE_UPSERT, TEST_BLOG_SETTINGS_BUNDLE)
    await loadCommentsAndItems(mockDb, session, POST_ONE_UPSERT)

    expect(ensureCommentPage).toHaveBeenCalledOnce()
    expect(commentPublicQuery.loadComments).toHaveBeenCalledWith(mockDb, session, POST_ONE_UPSERT, 0, {
      ensurePage: false,
    })
  })
})
