import { beforeEach, describe, expect, it, vi } from 'vitest'

import { makeLoaderArgs } from '#/_helpers/context'
import { adminSession, authorSession } from '#/_helpers/session'
import { EMPTY_STATE_LINES } from '@/shared/contracts/dashboard'

// The dashboard loader is an assembly over five domain services — mock
// them all and pin the assembly (admin-only branches, stats, and the
// draft/published projections) so a refactor of one service can't
// silently change the route payload.

const pendingDashboard = { items: [], total: 0, counts: { all: 0 }, hasMore: false }

vi.mock('@/server/domains/comments/services/admin-query', () => ({
  loadAdminPendingDashboard: vi.fn(async () => pendingDashboard),
}))
vi.mock('@/server/domains/analytics/services/counters', () => ({
  queryCounters: vi.fn(async () => ({ visits: 12, visitors: 5, referers: 3 })),
}))
vi.mock('@/server/domains/analytics/services/views', () => ({
  queryViews: vi.fn(async () => [{ time: '2024-01-01T00:00:00.000Z', visits: 12, visitors: 5 }]),
}))
vi.mock('@/server/domains/comments/services/mine-comments', () => ({
  countMyComments: vi.fn(async () => ({ total: 7, pending: 2, deleteRequested: 0 })),
}))
vi.mock('@/server/domains/posts/services/admin-query', () => ({
  countPostMetas: vi.fn(async (_db: unknown, filters: { lifecycle?: string }) =>
    filters.lifecycle === 'draft' ? 3 : 4,
  ),
  listPostMetas: vi.fn(async (_db: unknown, filters: { lifecycle?: string }) =>
    filters.lifecycle === 'draft'
      ? [{ id: 11, title: 'Draft A', updatedAt: new Date('2024-02-01T00:00:00.000Z'), publishedAt: null }]
      : [
          {
            id: 22,
            title: 'Published B',
            updatedAt: new Date('2024-02-02T00:00:00.000Z'),
            publishedAt: new Date('2024-02-03T00:00:00.000Z'),
          },
        ],
  ),
}))

const commentsAdminQuery = await import('@/server/domains/comments/services/admin-query')
const counters = await import('@/server/domains/analytics/services/counters')
const views = await import('@/server/domains/analytics/services/views')
const { loadAdminDashboardData } = await import('@/server/http/loaders/dashboard')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('loadAdminDashboardData', () => {
  it('assembles the full payload for an admin, admin-only branches included', async () => {
    const data = await loadAdminDashboardData(makeLoaderArgs({ session: adminSession() }))

    expect(data.name).toBe('admin')
    expect(data.role).toBe('admin')
    expect(data.pendingModeration).toBe(pendingDashboard)
    expect(data.visitSummary).toEqual({ visits: 12, visitors: 5, referers: 3 })
    expect(data.weeklyTrend).toHaveLength(1)
    expect(EMPTY_STATE_LINES).toContain(data.emptyStateLine)
    expect(data.stats).toEqual({ draftCount: 3, publishedCount: 4, myCommentsTotal: 7, myCommentsPending: 2 })
    expect(data.recentDrafts).toEqual([{ id: '11', title: 'Draft A', updatedAtIso: '2024-02-01T00:00:00.000Z' }])
    // Published cards prefer publishedAt over updatedAt.
    expect(data.recentPublished).toEqual([{ id: '22', title: 'Published B', updatedAtIso: '2024-02-03T00:00:00.000Z' }])
  })

  it('keeps the admin-only branches null for an author', async () => {
    const data = await loadAdminDashboardData(makeLoaderArgs({ session: authorSession() }))

    expect(data.role).toBe('author')
    expect(data.pendingModeration).toBeNull()
    expect(data.visitSummary).toBeNull()
    expect(data.weeklyTrend).toBeNull()
    expect(data.stats).toEqual({ draftCount: 3, publishedCount: 4, myCommentsTotal: 7, myCommentsPending: 2 })
    expect(vi.mocked(commentsAdminQuery.loadAdminPendingDashboard)).not.toHaveBeenCalled()
    expect(vi.mocked(counters.queryCounters)).not.toHaveBeenCalled()
    expect(vi.mocked(views.queryViews)).not.toHaveBeenCalled()
  })

  it('rejects anonymous viewers', async () => {
    await expect(loadAdminDashboardData(makeLoaderArgs({ user: null }))).rejects.toMatchObject({ status: 403 })
  })
})
