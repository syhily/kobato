import { Suspense, use } from 'react'
import { browser } from 'react-dom'

import { requireRole } from '@/server/domains/auth/rbac'
import { createSsrCaller } from '@/server/http/ssr-caller'
import { computeDateRange } from '@/shared/contracts/analytics'
import { pickEmptyStateLine } from '@/shared/contracts/dashboard'
import { titleMeta } from '@/shared/seo/title-meta'
import { roleLabel } from '@/shared/utils/roles'
import { BodyProjectionCard } from '@/ui/admin/dashboard/BodyProjectionCard'
import { QuickActions } from '@/ui/admin/dashboard/QuickActions'
import { RecentDraftsCard } from '@/ui/admin/dashboard/RecentDraftsCard'
import { RecentPublishedCard } from '@/ui/admin/dashboard/RecentPublishedCard'
import { SearchReindexCard } from '@/ui/admin/dashboard/SearchReindexCard'
import { StatsGrid } from '@/ui/admin/dashboard/StatsGrid'
import { PendingModerationPanel } from '@/ui/admin/welcome/PendingModerationPanel'
import { VisitSummaryCard } from '@/ui/admin/welcome/VisitSummaryCard'

import type { Route } from './+types/dashboard'

export const meta = titleMeta('欢迎')

// Keep in lockstep with the `PAGE_SIZE` constant in `PendingModerationPanel.tsx` — the panel's pagination assumes this size.
const PENDING_PAGE_SIZE = 3

// The `analytics.*` inputs are strings (`parseAnalyticsInput` parseInts them);
// `computeDateRange` yields unix seconds, so stringify.
export async function loader({ request, context }: Route.LoaderArgs) {
  const { caller, viewer } = createSsrCaller({ request, context })
  const user = viewer ?? undefined
  // Re-assert author+ so `user` narrows to non-null for the loader body.
  requireRole(user, 'author')

  const admin = user.role === 'admin'

  const now = new Date()
  const nowSec = Math.floor(now.getTime() / 1000)
  const dayRange = { startAt: nowSec - 24 * 60 * 60, endAt: nowSec }
  const weekRange = computeDateRange('last-7d', now)
  const [pendingModeration, visitSummary, weeklyTrend, mySummary, myCommentCounts] = await Promise.all([
    admin
      ? caller.admin.comments.listPendingDashboard({ kind: 'all', offset: 0, limit: PENDING_PAGE_SIZE })
      : Promise.resolve(null),
    admin
      ? caller.analytics.counters({ startAt: String(dayRange.startAt), endAt: String(dayRange.endAt) })
      : Promise.resolve(null),
    admin
      ? caller.analytics.views({ startAt: String(weekRange.startAt), endAt: String(weekRange.endAt) })
      : Promise.resolve(null),
    caller.admin.posts.mySummary(),
    caller.comments.myCounts(),
  ])

  return {
    name: user.name,
    role: user.role,
    pendingModeration,
    visitSummary,
    weeklyTrend,
    emptyStateLine: pickEmptyStateLine(),
    stats: {
      draftCount: mySummary.draftCount,
      publishedCount: mySummary.publishedCount,
      myCommentsTotal: myCommentCounts.total,
      myCommentsPending: myCommentCounts.pending,
    },
    // Pass through untouched (id stringified, title, published falls back to updatedAt).
    recentDrafts: mySummary.recentDrafts,
    recentPublished: mySummary.recentPublished,
  }
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

function Greeting({ name }: { name: string }) {
  use(browser())
  return <>{`${greetingForHour(new Date().getHours())}，${name}`}</>
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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 rounded-lg border bg-card p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">
            <Suspense fallback={name}>
              <Greeting name={name} />
            </Suspense>
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
      {isAdmin && (
        <div className="grid gap-4 lg:grid-cols-2">
          <SearchReindexCard />
          <BodyProjectionCard />
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <RecentPublishedCard posts={recentPublished} />
        <RecentDraftsCard drafts={recentDrafts} />
      </div>
    </div>
  )
}
