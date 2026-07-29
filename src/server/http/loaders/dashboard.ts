import type { LoaderFunctionArgs } from 'react-router'

import type { CountersDto, ViewsPoint } from '@/shared/contracts/analytics'
import type { DraftSummary } from '@/shared/contracts/dashboard'
import type { ListPendingDashboardOutput } from '@/shared/types/comments'

import { getAnalyticsReader } from '@/server/bootstrap/analytics-lifecycle'
import { queryCounters } from '@/server/domains/analytics/services/counters'
import { queryViews } from '@/server/domains/analytics/services/views'
import { requireRole } from '@/server/domains/auth/rbac'
import { loadAdminPendingDashboard } from '@/server/domains/comments/services/admin-query'
import { countMyComments } from '@/server/domains/comments/services/mine-comments'
import { countPostMetas, listPostMetas } from '@/server/domains/posts/services/admin-query'
import { getRequestContext } from '@/server/http/request-context'
import { computeDateRange } from '@/shared/contracts/analytics'
import { pickEmptyStateLine } from '@/shared/contracts/dashboard'
import { idFromString } from '@/shared/utils/id'

export interface AdminDashboardData {
  name: string
  role: 'admin' | 'author' | 'visitor'
  /** Admin-only branches — `null` for authors (the UI hides those cards). */
  pendingModeration: ListPendingDashboardOutput | null
  visitSummary: CountersDto | null
  weeklyTrend: ViewsPoint[] | null
  emptyStateLine: string
  stats: {
    draftCount: number
    publishedCount: number
    myCommentsTotal: number
    myCommentsPending: number
  }
  recentDrafts: DraftSummary[]
  recentPublished: DraftSummary[]
}

const RECENT_DRAFTS_LIMIT = 5
const RECENT_PUBLISHED_LIMIT = 5
// Must stay in lockstep with the `PAGE_SIZE` constant in
// `PendingModerationPanel.tsx` — the panel's pagination math reads the
// initial payload assuming this page size.
const PENDING_PAGE_SIZE = 3

// The whole dashboard data assembly behind `routes/admin/dashboard.tsx`:
// one 8-way fan-out across the comments/analytics/posts domain services
// plus the wire projections. The route module keeps context extraction,
// this one call, and rendering.
export async function loadAdminDashboardData({
  request,
  context,
}: Pick<LoaderFunctionArgs, 'request' | 'context'>): Promise<AdminDashboardData> {
  const rc = getRequestContext({ request, context })
  const ctx = { user: rc.viewer ?? undefined, role: rc.viewer?.role ?? null }
  // Defence-in-depth: `admin.layout` already gates author+, but
  // asserting here narrows `ctx.user` / `ctx.role` to non-null for the
  // loader body so the response shape is statically tight.
  requireRole(ctx, 'author')
  const db = rc.db
  const now = new Date()

  const userId = idFromString(ctx.user.id)
  const authorId = userId
  const admin = ctx.user.role === 'admin'

  // Fan out every dashboard query in one go. Each branch is a small
  // count(*) or LIMIT-5 select, so the round-trip wins dominate the
  // per-query CPU cost.
  const nowSec = Math.floor(now.getTime() / 1000)
  const dayRange = { startAt: nowSec - 24 * 60 * 60, endAt: nowSec }
  const weekRange = computeDateRange('last-7d', now)

  const [
    pendingModeration,
    visitSummary,
    weeklyTrend,
    draftCount,
    publishedCount,
    myCommentCounts,
    recentDraftRows,
    recentPublishedRows,
  ] = await Promise.all([
    admin ? loadAdminPendingDashboard(db, 'all', 0, PENDING_PAGE_SIZE) : Promise.resolve(null),
    admin ? queryCounters(getAnalyticsReader(), { range: dayRange, filters: {} }) : Promise.resolve(null),
    admin ? queryViews(getAnalyticsReader(), { range: weekRange, filters: {} }) : Promise.resolve(null),
    countPostMetas(db, { authorId, deletedStatus: 'normal', lifecycle: 'draft' }),
    countPostMetas(db, { authorId, deletedStatus: 'normal', lifecycle: 'published' }),
    countMyComments(db, userId),
    listPostMetas(db, {
      authorId,
      deletedStatus: 'normal',
      lifecycle: 'draft',
      sortBy: 'updatedAt',
      sortOrder: 'desc',
      limit: RECENT_DRAFTS_LIMIT,
    }),
    listPostMetas(db, {
      authorId,
      deletedStatus: 'normal',
      lifecycle: 'published',
      sortBy: 'publishedAt',
      sortOrder: 'desc',
      limit: RECENT_PUBLISHED_LIMIT,
    }),
  ])

  // Project drafts: only id + title + updatedAt needed for the card.
  const recentDrafts: DraftSummary[] = recentDraftRows.map((row) => ({
    id: String(row.id),
    title: row.title,
    updatedAtIso: row.updatedAt.toISOString(),
  }))

  const recentPublished: DraftSummary[] = recentPublishedRows.map((row) => ({
    id: String(row.id),
    title: row.title,
    updatedAtIso: row.publishedAt?.toISOString() ?? row.updatedAt.toISOString(),
  }))

  return {
    name: ctx.user.name,
    role: ctx.user.role,
    pendingModeration,
    visitSummary,
    weeklyTrend,
    emptyStateLine: pickEmptyStateLine(),
    stats: {
      draftCount,
      publishedCount,
      myCommentsTotal: myCommentCounts.total,
      myCommentsPending: myCommentCounts.pending,
    },
    recentDrafts,
    recentPublished,
  }
}
