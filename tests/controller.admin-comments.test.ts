import { call } from '@orpc/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AdminCommentWire } from '@/shared/contracts/comments'
import type { AdminComment } from '@/shared/types/comments'

import { makeAuthedCtx } from './_helpers/mock-ctx'

vi.mock('@/server/domains/comments/services/admin-query', () => ({
  loadAdminPendingDashboard: vi.fn(),
  loadAllComments: vi.fn(),
  searchAuthorOptions: vi.fn(),
  searchPageOptions: vi.fn(),
}))

vi.mock('@/server/domains/comments/services/moderate', () => ({
  approveComment: vi.fn(),
  deleteComment: vi.fn(),
}))

vi.mock('@/server/domains/comments/projection', () => ({
  asAdminCommentsWire: vi.fn(),
}))

vi.mock('@/server/domains/comments/repos/moderation', () => ({
  adminClearDeleteRequest: vi.fn(),
  softDeleteCommentById: vi.fn(),
}))

vi.mock('@/server/domains/comments/repos/public-query', () => ({
  findCommentWithUserById: vi.fn(),
}))

const adminQuery = await import('@/server/domains/comments/services/admin-query')
const moderate = await import('@/server/domains/comments/services/moderate')
const projection = await import('@/server/domains/comments/projection')
const moderationRepo = await import('@/server/domains/comments/repos/moderation')
const queryRepo = await import('@/server/domains/comments/repos/public-query')
const { adminCommentsRouter } = await import('@/server/http/controllers/admin/comments.controller')

beforeEach(() => {
  vi.clearAllMocks()
})

const comment = {
  id: '1',
  createAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deleteAt: null,
  deleteRequestedAt: null,
  body: [],
  content: 'hello',
  type: 'post' as const,
  ownerId: '1',
  userId: '1',
  isVerified: true,
  ua: 'Mozilla/5.0',
  ip: '127.0.0.1',
  rid: 1,
  isCollapsed: false,
  isPending: false,
  isPinned: false,
  voteUp: 0,
  voteDown: 0,
  rootId: null,
  name: 'Alice',
  email: 'alice@example.com',
  emailVerified: true,
  link: null,
  badgeName: null,
  badgeColor: null,
  badgeTextColor: null,
  pageTitle: 'Post 1',
  pagePublicId: 'pid-1',
  pageCover: null,
  pagePermalink: null,
}

describe('adminCommentsRouter.approve', () => {
  it('resolves to undefined on success', async () => {
    vi.mocked(moderate.approveComment).mockResolvedValueOnce(undefined)
    const ctx = makeAuthedCtx()
    const res = await call(adminCommentsRouter.approve, { rid: '1' }, { context: ctx })
    expect(res).toBeUndefined()
  })
})

describe('adminCommentsRouter.delete', () => {
  it('resolves to undefined on success', async () => {
    vi.mocked(moderate.deleteComment).mockResolvedValueOnce(undefined)
    const ctx = makeAuthedCtx()
    const res = await call(adminCommentsRouter.delete, { rid: '1' }, { context: ctx })
    expect(res).toBeUndefined()
  })
})

describe('adminCommentsRouter.loadAll', () => {
  it('returns comments, total, hasMore and statusCounts', async () => {
    vi.mocked(adminQuery.loadAllComments).mockResolvedValueOnce({
      comments: [comment as unknown as AdminComment],
      total: 1,
      hasMore: false,
      statusCounts: { all: 1, pending: 0, approved: 1 },
    })
    vi.mocked(projection.asAdminCommentsWire).mockReturnValue([comment as unknown as AdminCommentWire])
    const ctx = makeAuthedCtx()
    const res = await call(adminCommentsRouter.loadAll, { offset: 0, limit: 20, status: 'all' }, { context: ctx })
    expect(res.comments).toHaveLength(1)
    expect(res.total).toBe(1)
    expect(res.hasMore).toBe(false)
    expect(res.statusCounts.all).toBe(1)
  })

  it('forwards `q` and `match: "contains"` to loadAllComments', async () => {
    vi.mocked(adminQuery.loadAllComments).mockResolvedValueOnce({
      comments: [],
      total: 0,
      hasMore: false,
      statusCounts: { all: 0, pending: 0, approved: 0 },
    })
    vi.mocked(projection.asAdminCommentsWire).mockReturnValue([])
    const ctx = makeAuthedCtx()
    await call(adminCommentsRouter.loadAll, { offset: 0, limit: 20, q: 'foo', match: 'contains' }, { context: ctx })
    expect(adminQuery.loadAllComments).toHaveBeenCalledWith(
      ctx.db,
      0,
      20,
      undefined,
      undefined,
      undefined,
      'foo',
      'contains',
      undefined,
      undefined,
    )
  })

  it('forwards `match: "does-not-contain"` so the repo can flip ILIKE to NOT ILIKE', async () => {
    vi.mocked(adminQuery.loadAllComments).mockResolvedValueOnce({
      comments: [],
      total: 0,
      hasMore: false,
      statusCounts: { all: 0, pending: 0, approved: 0 },
    })
    vi.mocked(projection.asAdminCommentsWire).mockReturnValue([])
    const ctx = makeAuthedCtx()
    await call(
      adminCommentsRouter.loadAll,
      { offset: 0, limit: 20, q: 'spam', match: 'does-not-contain' },
      { context: ctx },
    )
    expect(adminQuery.loadAllComments).toHaveBeenCalledWith(
      ctx.db,
      0,
      20,
      undefined,
      undefined,
      undefined,
      'spam',
      'does-not-contain',
      undefined,
      undefined,
    )
  })

  it('rejects an unknown `match` value (Zod validation)', async () => {
    const ctx = makeAuthedCtx()
    await expect(
      call(
        adminCommentsRouter.loadAll,
        { offset: 0, limit: 20, q: 'foo', match: 'equals' as 'contains' },
        { context: ctx },
      ),
    ).rejects.toBeDefined()
    expect(adminQuery.loadAllComments).not.toHaveBeenCalled()
  })

  it('trims `q` before passing to loadAllComments (Zod `.trim()`)', async () => {
    vi.mocked(adminQuery.loadAllComments).mockResolvedValueOnce({
      comments: [],
      total: 0,
      hasMore: false,
      statusCounts: { all: 0, pending: 0, approved: 0 },
    })
    vi.mocked(projection.asAdminCommentsWire).mockReturnValue([])
    const ctx = makeAuthedCtx()
    await call(adminCommentsRouter.loadAll, { offset: 0, limit: 20, q: '  foo  ', match: 'contains' }, { context: ctx })
    expect(adminQuery.loadAllComments).toHaveBeenCalledWith(
      ctx.db,
      0,
      20,
      undefined,
      undefined,
      undefined,
      'foo',
      'contains',
      undefined,
      undefined,
    )
  })

  it('forwards `createdAfter` and `createdBefore` as Date objects to loadAllComments', async () => {
    vi.mocked(adminQuery.loadAllComments).mockResolvedValueOnce({
      comments: [],
      total: 0,
      hasMore: false,
      statusCounts: { all: 0, pending: 0, approved: 0 },
    })
    vi.mocked(projection.asAdminCommentsWire).mockReturnValue([])
    const ctx = makeAuthedCtx()
    await call(
      adminCommentsRouter.loadAll,
      {
        offset: 0,
        limit: 20,
        createdAfter: '2026-06-01T00:00:00.000Z',
        createdBefore: '2026-06-30T23:59:59.999Z',
      },
      { context: ctx },
    )
    expect(adminQuery.loadAllComments).toHaveBeenCalledWith(
      ctx.db,
      0,
      20,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      new Date('2026-06-01T00:00:00.000Z'),
      new Date('2026-06-30T23:59:59.999Z'),
    )
  })

  it('rejects a malformed `createdAfter` (Zod ISO datetime validation)', async () => {
    const ctx = makeAuthedCtx()
    await expect(
      call(adminCommentsRouter.loadAll, { offset: 0, limit: 20, createdAfter: 'not-a-date' }, { context: ctx }),
    ).rejects.toBeDefined()
    expect(adminQuery.loadAllComments).not.toHaveBeenCalled()
  })

  it('rejects a malformed `createdBefore` (Zod ISO datetime validation)', async () => {
    const ctx = makeAuthedCtx()
    await expect(
      call(adminCommentsRouter.loadAll, { offset: 0, limit: 20, createdBefore: '2026-13-99' }, { context: ctx }),
    ).rejects.toBeDefined()
    expect(adminQuery.loadAllComments).not.toHaveBeenCalled()
  })
})

describe('adminCommentsRouter.searchPages', () => {
  it('returns pages matching query', async () => {
    vi.mocked(adminQuery.searchPageOptions).mockResolvedValueOnce([{ key: 'p1', title: 'Page 1' }])
    const ctx = makeAuthedCtx()
    const res = await call(adminCommentsRouter.searchPages, { q: 'page' }, { context: ctx })
    expect(res.pages).toHaveLength(1)
    expect(res.pages[0].title).toBe('Page 1')
  })
})

describe('adminCommentsRouter.searchAuthors', () => {
  it('returns authors matching query', async () => {
    vi.mocked(adminQuery.searchAuthorOptions).mockResolvedValueOnce([{ id: 1n, name: 'Alice' }])
    const ctx = makeAuthedCtx()
    const res = await call(adminCommentsRouter.searchAuthors, { q: 'alice' }, { context: ctx })
    expect(res.authors).toHaveLength(1)
    expect(res.authors[0].name).toBe('Alice')
  })
})

describe('adminCommentsRouter.approveCommentDeletion', () => {
  it('returns success when approving deletion', async () => {
    vi.mocked(queryRepo.findCommentWithUserById).mockResolvedValueOnce({
      deleteRequestedAt: new Date(),
    } as unknown as Awaited<ReturnType<typeof queryRepo.findCommentWithUserById>>)
    vi.mocked(moderationRepo.softDeleteCommentById).mockResolvedValueOnce(undefined)
    const ctx = makeAuthedCtx()
    const res = await call(
      adminCommentsRouter.approveCommentDeletion,
      { commentId: '1', approve: true },
      { context: ctx },
    )
    expect(res).toEqual({ success: true })
  })

  it('throws NOT_FOUND when comment does not exist', async () => {
    vi.mocked(queryRepo.findCommentWithUserById).mockResolvedValueOnce(
      null as unknown as Awaited<ReturnType<typeof queryRepo.findCommentWithUserById>>,
    )
    const ctx = makeAuthedCtx()
    await expect(
      call(adminCommentsRouter.approveCommentDeletion, { commentId: '999', approve: true }, { context: ctx }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('throws CONFLICT when no delete request exists', async () => {
    vi.mocked(queryRepo.findCommentWithUserById).mockResolvedValueOnce({
      deleteRequestedAt: null,
    } as unknown as Awaited<ReturnType<typeof queryRepo.findCommentWithUserById>>)
    const ctx = makeAuthedCtx()
    await expect(
      call(adminCommentsRouter.approveCommentDeletion, { commentId: '1', approve: true }, { context: ctx }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })
})

describe('adminCommentsRouter.listPendingDashboard', () => {
  it('returns pending dashboard items', async () => {
    vi.mocked(adminQuery.loadAdminPendingDashboard).mockResolvedValueOnce({
      items: [
        {
          id: '1',
          kind: 'approval' as const,
          authorName: 'Alice',
          authorLink: null,
          excerpt: 'Hello',
          createdAtIso: '2026-01-01T00:00:00.000Z',
          deleteRequestedAtIso: null,
          pageTitle: 'Post 1',
          pagePermalink: '/posts/hello',
        },
      ],
      total: 1,
      hasMore: false,
      counts: { all: 1, approval: 1, deletion: 0 },
    } as unknown as Awaited<ReturnType<typeof adminQuery.loadAdminPendingDashboard>>)
    const ctx = makeAuthedCtx()
    const res = await call(adminCommentsRouter.listPendingDashboard, {}, { context: ctx })
    expect(res.items).toHaveLength(1)
    expect(res.total).toBe(1)
  })
})
