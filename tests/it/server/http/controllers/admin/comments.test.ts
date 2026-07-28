import { call } from '@orpc/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AdminCommentWire } from '@/shared/contracts/comments'
import type { AdminComment } from '@/shared/types/comments'

import { makeAuthedCtx } from '#/_helpers/mock-ctx'
import { DomainError } from '@/server/infra/http/errors'

vi.mock('@/server/domains/comments/services/admin-query', () => ({
  loadAdminPendingDashboard: vi.fn(),
  loadAllComments: vi.fn(),
  searchAuthorOptions: vi.fn(),
  searchPageOptions: vi.fn(),
}))

vi.mock('@/server/domains/comments/services/moderate', () => ({
  adminClearDeleteRequest: vi.fn(),
  approveComment: vi.fn(),
  deleteCommentById: vi.fn(),
  resolveCommentDeleteRequest: vi.fn(),
  softDeleteCommentById: vi.fn(),
}))

vi.mock('@/server/domains/comments/projection', () => ({
  asAdminCommentsWire: vi.fn(),
}))

const adminQuery = await import('@/server/domains/comments/services/admin-query')
const moderate = await import('@/server/domains/comments/services/moderate')
const projection = await import('@/server/domains/comments/projection')
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
    const res = await call(adminCommentsRouter.approve, { commentId: '1' }, { context: ctx })
    expect(res).toBeUndefined()
  })
})

describe('adminCommentsRouter.delete', () => {
  it('resolves to undefined on success', async () => {
    vi.mocked(moderate.deleteCommentById).mockResolvedValueOnce(undefined)
    const ctx = makeAuthedCtx()
    const res = await call(adminCommentsRouter.delete, { commentId: '1' }, { context: ctx })
    expect(res).toBeUndefined()
  })
})

describe('adminCommentsRouter.loadAll', () => {
  it('returns comments, total, hasMore and statusCounts', async () => {
    vi.mocked(adminQuery.loadAllComments).mockResolvedValueOnce({
      comments: [comment as unknown as AdminComment],
      total: 1,
      hasMore: false,
      statusCounts: { all: 1, pending: 0, approved: 1, deleteRequested: 0 },
    })
    vi.mocked(projection.asAdminCommentsWire).mockReturnValue([comment as unknown as AdminCommentWire])
    const ctx = makeAuthedCtx()
    const res = await call(adminCommentsRouter.loadAll, { offset: 0, limit: 20, status: 'all' }, { context: ctx })
    expect(res.comments).toHaveLength(1)
    expect(res.total).toBe(1)
    expect(res.hasMore).toBe(false)
    expect(res.statusCounts.all).toBe(1)
  })

  it('accepts `status: "deleteRequested"` and forwards it to loadAllComments', async () => {
    vi.mocked(adminQuery.loadAllComments).mockResolvedValueOnce({
      comments: [],
      total: 0,
      hasMore: false,
      statusCounts: { all: 0, pending: 0, approved: 0, deleteRequested: 0 },
    })
    vi.mocked(projection.asAdminCommentsWire).mockReturnValue([])
    const ctx = makeAuthedCtx()
    await call(adminCommentsRouter.loadAll, { offset: 0, limit: 20, status: 'deleteRequested' }, { context: ctx })
    expect(adminQuery.loadAllComments).toHaveBeenCalledWith(
      ctx.db,
      expect.objectContaining({ status: 'deleteRequested' }),
    )
  })

  it('forwards `q` and `match: "contains"` to loadAllComments', async () => {
    vi.mocked(adminQuery.loadAllComments).mockResolvedValueOnce({
      comments: [],
      total: 0,
      hasMore: false,
      statusCounts: { all: 0, pending: 0, approved: 0, deleteRequested: 0 },
    })
    vi.mocked(projection.asAdminCommentsWire).mockReturnValue([])
    const ctx = makeAuthedCtx()
    await call(adminCommentsRouter.loadAll, { offset: 0, limit: 20, q: 'foo', match: 'contains' }, { context: ctx })
    expect(adminQuery.loadAllComments).toHaveBeenCalledWith(ctx.db, {
      offset: 0,
      limit: 20,
      filterQ: 'foo',
      filterMatch: 'contains',
    })
  })

  it('forwards `match: "does-not-contain"` so the repo can flip ILIKE to NOT ILIKE', async () => {
    vi.mocked(adminQuery.loadAllComments).mockResolvedValueOnce({
      comments: [],
      total: 0,
      hasMore: false,
      statusCounts: { all: 0, pending: 0, approved: 0, deleteRequested: 0 },
    })
    vi.mocked(projection.asAdminCommentsWire).mockReturnValue([])
    const ctx = makeAuthedCtx()
    await call(
      adminCommentsRouter.loadAll,
      { offset: 0, limit: 20, q: 'spam', match: 'does-not-contain' },
      { context: ctx },
    )
    expect(adminQuery.loadAllComments).toHaveBeenCalledWith(ctx.db, {
      offset: 0,
      limit: 20,
      filterQ: 'spam',
      filterMatch: 'does-not-contain',
    })
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
      statusCounts: { all: 0, pending: 0, approved: 0, deleteRequested: 0 },
    })
    vi.mocked(projection.asAdminCommentsWire).mockReturnValue([])
    const ctx = makeAuthedCtx()
    await call(adminCommentsRouter.loadAll, { offset: 0, limit: 20, q: '  foo  ', match: 'contains' }, { context: ctx })
    expect(adminQuery.loadAllComments).toHaveBeenCalledWith(ctx.db, {
      offset: 0,
      limit: 20,
      filterQ: 'foo',
      filterMatch: 'contains',
    })
  })

  it('forwards `createdAfter` and `createdBefore` as Date objects to loadAllComments', async () => {
    vi.mocked(adminQuery.loadAllComments).mockResolvedValueOnce({
      comments: [],
      total: 0,
      hasMore: false,
      statusCounts: { all: 0, pending: 0, approved: 0, deleteRequested: 0 },
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
    expect(adminQuery.loadAllComments).toHaveBeenCalledWith(ctx.db, {
      offset: 0,
      limit: 20,
      filterCreatedAfter: new Date('2026-06-01T00:00:00.000Z'),
      filterCreatedBefore: new Date('2026-06-30T23:59:59.999Z'),
    })
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
    vi.mocked(adminQuery.searchAuthorOptions).mockResolvedValueOnce([{ id: 1, name: 'Alice' }])
    const ctx = makeAuthedCtx()
    const res = await call(adminCommentsRouter.searchAuthors, { q: 'alice' }, { context: ctx })
    expect(res.authors).toHaveLength(1)
    expect(res.authors[0].name).toBe('Alice')
  })
})

describe('adminCommentsRouter.approveCommentDeletion — orchestration only', () => {
  // The delete-request state machine (existence fence, pending-request
  // fence, approve → soft-delete / reject → clear, per-branch audit) is
  // pinned at the domain seam in
  // tests/it/server/domains/comments/moderation-flows.test.ts; here we
  // only pin the controller → service wiring and the error translation.
  it('delegates an approval to the comments domain and returns success', async () => {
    vi.mocked(moderate.resolveCommentDeleteRequest).mockResolvedValueOnce(undefined)
    const ctx = makeAuthedCtx()
    const res = await call(
      adminCommentsRouter.approveCommentDeletion,
      { commentId: '1', approve: true },
      { context: ctx },
    )
    expect(res).toEqual({ success: true })
    expect(moderate.resolveCommentDeleteRequest).toHaveBeenCalledWith(ctx.db, '1', true, ctx)
  })

  it('delegates a rejection to the comments domain and returns success', async () => {
    vi.mocked(moderate.resolveCommentDeleteRequest).mockResolvedValueOnce(undefined)
    const ctx = makeAuthedCtx()
    const res = await call(
      adminCommentsRouter.approveCommentDeletion,
      { commentId: '1', approve: false },
      { context: ctx },
    )
    expect(res).toEqual({ success: true })
    expect(moderate.resolveCommentDeleteRequest).toHaveBeenCalledWith(ctx.db, '1', false, ctx)
  })

  it('translates a domain NOT_FOUND onto the wire', async () => {
    vi.mocked(moderate.resolveCommentDeleteRequest).mockRejectedValueOnce(new DomainError('NOT_FOUND', '评论不存在。'))
    const ctx = makeAuthedCtx()
    await expect(
      call(adminCommentsRouter.approveCommentDeletion, { commentId: '999', approve: true }, { context: ctx }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('translates a domain CONFLICT onto the wire', async () => {
    vi.mocked(moderate.resolveCommentDeleteRequest).mockRejectedValueOnce(
      new DomainError('CONFLICT', '该评论没有待处理的删除申请。'),
    )
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
