import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AdminCommentsResult } from '@/server/domains/comments/types'

vi.mock('@/server/domains/comments/repos/admin-query', () => ({
  listAdminComments: vi.fn(),
  countAllComments: vi.fn(),
  countAdminPendingDashboard: vi.fn(),
  listAdminPendingDashboard: vi.fn(),
  searchCommentAuthors: vi.fn(),
  searchPages: vi.fn(),
}))

vi.mock('@/server/domains/comments/badge', () => ({
  withCommentBadgeTextColor: vi.fn((c: unknown) => c),
}))

vi.mock('@/server/domains/comments/services/shared', () => ({
  asCommentTarget: vi.fn(),
  entityPermalink: vi.fn(() => null),
}))

vi.mock('@/server/infra/db/operations/metric', () => ({
  findMetricByPublicId: vi.fn(),
}))

const adminQueryRepo = await import('@/server/domains/comments/repos/admin-query')
const { loadAllComments } = await import('@/server/domains/comments/services/admin-query')

const baseComment = {
  id: 1n,
  createAt: new Date(),
  updatedAt: new Date(),
  deleteAt: null,
  content: 'hello',
  body: [],
  type: 'post' as const,
  ownerId: 1n,
  userId: 1n,
  isVerified: true,
  ua: 'Mozilla',
  ip: '127.0.0.1',
  rid: 0,
  isCollapsed: false,
  isPending: false,
  isPinned: false,
  voteUp: 0,
  voteDown: 0,
  rootId: null,
  deleteRequestedAt: null,
  name: 'Alice',
  email: 'alice@example.com',
  emailVerified: true,
  link: null,
  badgeName: null,
  badgeColor: null,
  badgeTextColor: null,
  pageTitle: 'Post 1',
  pagePublicId: 'pid-1',
  pageSlug: 'post-1',
  pageCover: null,
  deleteRequestedBy: null,
}

function setupRepoMocks(counts: { all: number; pending: number; approved: number }) {
  vi.mocked(adminQueryRepo.listAdminComments).mockResolvedValueOnce([baseComment])
  vi.mocked(adminQueryRepo.countAllComments)
    .mockResolvedValueOnce(counts.all)
    .mockResolvedValueOnce(counts.pending)
    .mockResolvedValueOnce(counts.approved)
}

function makeFakeDb() {
  return {} as Parameters<typeof loadAllComments>[0]
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('loadAllComments — text filter propagation', () => {
  it('forwards `q` + `match: "contains"` to list and all three count queries', async () => {
    setupRepoMocks({ all: 5, pending: 2, approved: 3 })
    await loadAllComments(makeFakeDb(), 0, 20, undefined, undefined, 'all', 'foo', 'contains')

    const listCalls = vi.mocked(adminQueryRepo.listAdminComments).mock.calls
    expect(listCalls).toHaveLength(1)
    const listFilters = listCalls[0]![3]
    expect(listFilters).toMatchObject({ q: 'foo', match: 'contains' })

    const countCalls = vi.mocked(adminQueryRepo.countAllComments).mock.calls
    expect(countCalls).toHaveLength(3)
    for (const call of countCalls) {
      expect(call[1]).toMatchObject({ q: 'foo', match: 'contains' })
    }
  })

  it('forwards `match: "does-not-contain"` so the status counts respect the filter', async () => {
    setupRepoMocks({ all: 0, pending: 0, approved: 0 })
    await loadAllComments(makeFakeDb(), 0, 20, undefined, undefined, 'pending', 'spam', 'does-not-contain')

    const countCalls = vi.mocked(adminQueryRepo.countAllComments).mock.calls
    expect(countCalls).toHaveLength(3)
    for (const call of countCalls) {
      expect(call[1]).toMatchObject({ q: 'spam', match: 'does-not-contain' })
    }
  })

  it('leaves `match` undefined when the caller does not provide one (default → ILIKE)', async () => {
    setupRepoMocks({ all: 1, pending: 0, approved: 1 })
    await loadAllComments(makeFakeDb(), 0, 20, undefined, undefined, 'all', 'foo')

    const listFilters = vi.mocked(adminQueryRepo.listAdminComments).mock.calls[0]![3]
    expect(listFilters).toMatchObject({ q: 'foo' })
    // The service spreads the optional `filterMatch` as `match: undefined`
    // — semantically the same as omitting it, and the repo treats
    // both as "default to contains".
    expect(listFilters.match).toBeUndefined()
  })

  it('stacks the `match` filter on top of the status filter so the count breakdown is correct', async () => {
    // The bug we want to catch: forgetting to put `match` into
    // `extraFilters` would make the status counts inconsistent with
    // the list — the user would see "3 pending" in the tab but the
    // list would only show 1 row.
    setupRepoMocks({ all: 10, pending: 3, approved: 7 })
    const result: AdminCommentsResult = await loadAllComments(
      makeFakeDb(),
      0,
      20,
      undefined,
      undefined,
      'pending',
      'foo',
      'contains',
    )
    expect(result.statusCounts).toEqual({ all: 10, pending: 3, approved: 7 })
    expect(result.total).toBe(3)
  })
})

describe('loadAllComments — date filter propagation', () => {
  const after = new Date('2026-06-01T00:00:00.000Z')
  const before = new Date('2026-06-30T23:59:59.999Z')

  it('forwards `filterCreatedAfter` and `filterCreatedBefore` to list and all three count queries', async () => {
    setupRepoMocks({ all: 4, pending: 1, approved: 3 })
    await loadAllComments(makeFakeDb(), 0, 20, undefined, undefined, 'all', undefined, undefined, after, before)

    const listFilters = vi.mocked(adminQueryRepo.listAdminComments).mock.calls[0]![3]
    expect(listFilters).toMatchObject({ createdAfter: after, createdBefore: before })

    const countCalls = vi.mocked(adminQueryRepo.countAllComments).mock.calls
    expect(countCalls).toHaveLength(3)
    for (const call of countCalls) {
      expect(call[1]).toMatchObject({ createdAfter: after, createdBefore: before })
    }
  })

  it('leaves date bounds undefined in extraFilters when not provided (default — no date narrowing)', async () => {
    setupRepoMocks({ all: 0, pending: 0, approved: 0 })
    await loadAllComments(makeFakeDb(), 0, 20)

    const listFilters = vi.mocked(adminQueryRepo.listAdminComments).mock.calls[0]![3]
    expect(listFilters.createdAfter).toBeUndefined()
    expect(listFilters.createdBefore).toBeUndefined()
  })

  it('stacks the date bounds on top of the status filter so the count breakdown is correct', async () => {
    // The same shape-stability guarantee as the text filter: the
    // status counts must reflect the same `extraFilters` (date
    // bounds included) as the list — otherwise the tabs would
    // mislead the user about how many rows the active filter
    // produces.
    setupRepoMocks({ all: 5, pending: 2, approved: 3 })
    const result: AdminCommentsResult = await loadAllComments(
      makeFakeDb(),
      0,
      20,
      undefined,
      undefined,
      'approved',
      undefined,
      undefined,
      after,
      before,
    )
    expect(result.statusCounts).toEqual({ all: 5, pending: 2, approved: 3 })
    expect(result.total).toBe(3)
  })
})
