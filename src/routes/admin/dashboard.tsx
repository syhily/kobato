import { useState } from 'react'
import { data } from 'react-router'

import type { DraftSummary } from '@/ui/admin/dashboard/types'

import { queryCounters } from '@/server/domains/analytics/services/counters'
import { queryViews } from '@/server/domains/analytics/services/views'
import { getDbFromContext, getRouteRequestContext } from '@/server/domains/auth/context'
import { requireRole } from '@/server/domains/auth/rbac'
import { countMyComments } from '@/server/domains/comments/repos/admin-query'
import { loadAdminPendingDashboard } from '@/server/domains/comments/services/admin-query'
import { countPostMetas, listPostMetas } from '@/server/domains/posts/repos/admin-query'
import { bundleFromMatches, routeMeta } from '@/server/render/seo/meta'
import { computeDateRange } from '@/shared/contracts/analytics'
import { roleLabel } from '@/shared/utils/roles'
import { QuickActions } from '@/ui/admin/dashboard/QuickActions'
import { RecentDraftsCard } from '@/ui/admin/dashboard/RecentDraftsCard'
import { RecentPublishedCard } from '@/ui/admin/dashboard/RecentPublishedCard'
import { StatsGrid } from '@/ui/admin/dashboard/StatsGrid'
import { PendingModerationPanel, pickEmptyStateLine } from '@/ui/admin/welcome/PendingModerationPanel'
import { VisitSummaryCard } from '@/ui/admin/welcome/VisitSummaryCard'

import type { Route } from './+types/dashboard'

export function meta({ matches }: Route.MetaArgs) {
  return routeMeta({ title: '欢迎' }, bundleFromMatches(matches))
}

const RECENT_DRAFTS_LIMIT = 5
const RECENT_PUBLISHED_LIMIT = 5
// Must stay in lockstep with the `PAGE_SIZE` constant in
// `PendingModerationPanel.tsx` — the panel's pagination math reads the
// initial payload assuming this page size.
const PENDING_PAGE_SIZE = 3

export async function loader({ request, context }: Route.LoaderArgs) {
  const ctx = getRouteRequestContext({ request, context })
  // Defence-in-depth: `admin.layout` already gates author+, but
  // asserting here narrows `ctx.user` / `ctx.role` to non-null for the
  // loader body so the response shape is statically tight.
  requireRole(ctx, 'author')
  const db = getDbFromContext({ request, context })
  const now = new Date()

  const userId = BigInt(ctx.user.id)
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
    admin ? queryCounters(db, { range: dayRange, filters: {} }) : Promise.resolve(null),
    admin ? queryViews(db, { range: weekRange, filters: {} }) : Promise.resolve(null),
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

  // Project recently published posts.
  const recentPublished: DraftSummary[] = recentPublishedRows.map((row) => ({
    id: String(row.id),
    title: row.title,
    updatedAtIso: row.publishedAt?.toISOString() ?? row.updatedAt.toISOString(),
  }))

  return data({
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
  })
}

function greetingForHour(hour: number): string {
  if (hour >= 23 || hour < 5) {
    return '夜深了，还没睡么？记得早点休息'
  }
  if (hour < 11) {
    return '早上好，新的一天开始啦'
  }
  if (hour < 14) {
    return '中午好，记得吃午饭'
  }
  if (hour < 18) {
    return '下午好'
  }
  return '晚上好'
}

function useGreeting() {
  // Lazy initializer computes once on mount without setState-in-effect.
  const [greeting] = useState(() => greetingForHour(new Date().getHours()))
  return greeting
}

export default function DashboardRoute({ loaderData }: Route.ComponentProps) {
  const {
    name,
    role,
    pendingModeration,
    visitSummary,
    weeklyTrend,
    emptyStateLine,
    stats,
    recentDrafts,
    recentPublished,
  } = loaderData
  const isAdmin = role === 'admin'

  const greeting = useGreeting()
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 rounded-lg border bg-card p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">
            {greeting}，{name}
          </h1>
          <p className="mt-1 text-muted-foreground">当前身份：{roleLabel(role)}</p>
        </div>
        <QuickActions />
      </div>
      {isAdmin && visitSummary !== null && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <VisitSummaryCard summary={visitSummary} weeklyTrend={weeklyTrend} />
          {pendingModeration !== null && (
            <PendingModerationPanel initial={pendingModeration} emptyStateLine={emptyStateLine} />
          )}
        </div>
      )}
      <StatsGrid stats={stats} />
      <div className="grid gap-4 lg:grid-cols-2">
        <RecentPublishedCard posts={recentPublished} />
        <RecentDraftsCard drafts={recentDrafts} />
      </div>
    </div>
  )
}
