import type { Database } from '@kobato/db/database.ts'

import { TEST_BLOG_SETTINGS_BUNDLE } from '@kobato/test/blog-settings.ts'
import { seedMetric } from '@kobato/test/db.ts'
import { regularSession } from '@kobato/test/session.ts'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@kobato/server/domains/comments/services/shared.ts', () => ({
  ensureCommentPage: vi.fn(async () => seedMetric()),
}))

vi.mock('@kobato/server/domains/comments/services/public-query.ts', () => ({
  commentThreadFingerprint: vi.fn(async () => 'comments-fingerprint'),
  loadComments: vi.fn(),
  parseComments: vi.fn(async () => []),
}))
vi.mock('@kobato/server/domains/comments/services/likes.ts', () => ({
  queryLikes: vi.fn(),
  startLikeTokenSweep: vi.fn(),
}))
vi.mock('@kobato/server/http/loaders/sidebar.ts', () => ({ loadSidebarData: vi.fn() }))

const commentShared = await import('@kobato/server/domains/comments/services/shared.ts')
const commentPublicQuery = await import('@kobato/server/domains/comments/services/public-query.ts')
const likes = await import('@kobato/server/domains/comments/services/likes.ts')
const sidebar = await import('@kobato/server/http/loaders/sidebar.ts')
const { loadCommentsAndItems, loadDetailPageCritical } = await import('@kobato/server/http/loaders/comments.ts')

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
  it('loadComments + queryLikes + loadSidebarData + fingerprint run in parallel (≤100ms wall clock for 50ms each)', async () => {
    vi.mocked(commentPublicQuery.loadComments).mockImplementation(() =>
      delay({ count: 0, roots_count: 0, comments: [] }, 50),
    )
    vi.mocked(likes.queryLikes).mockImplementation(() => delay(0, 50))
    vi.mocked(commentPublicQuery.commentThreadFingerprint).mockImplementation(() => delay('comments-fingerprint', 50))
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
      loadDetailPageCritical(mockDb, regularSession(), POST_TIMING, TEST_BLOG_SETTINGS_BUNDLE),
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

    await loadDetailPageCritical(mockDb, session, POST_ONE_UPSERT, TEST_BLOG_SETTINGS_BUNDLE)
    await loadCommentsAndItems(mockDb, session, POST_ONE_UPSERT)

    expect(commentShared.ensureCommentPage).toHaveBeenCalledOnce()
    expect(commentPublicQuery.loadComments).toHaveBeenCalledWith(mockDb, session, POST_ONE_UPSERT, 0, {
      ensurePage: false,
    })
  })
})
