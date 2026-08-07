import { useSyncExternalStore } from 'react'

import type { CountersDto, ViewsPoint } from '@/shared/contracts/analytics'
import type { DraftSummary } from '@/shared/contracts/dashboard'
import type { ListPendingDashboardOutput } from '@/shared/types/comments'

import { requireRole } from '@/server/domains/auth/rbac'
import { createSsrCaller } from '@/server/http/ssr-caller'
import { computeDateRange } from '@/shared/contracts/analytics'
import { pickEmptyStateLine } from '@/shared/contracts/dashboard'
import { titleMeta } from '@/shared/seo/title-meta'
import { roleLabel } from '@/shared/utils/roles'
import { QuickActions } from '@/ui/admin/dashboard/QuickActions'
import { RecentDraftsCard } from '@/ui/admin/dashboard/RecentDraftsCard'
import { RecentPublishedCard } from '@/ui/admin/dashboard/RecentPublishedCard'
import { SearchReindexCard } from '@/ui/admin/dashboard/SearchReindexCard'
import { StatsGrid } from '@/ui/admin/dashboard/StatsGrid'
import { PendingModerationPanel } from '@/ui/admin/welcome/PendingModerationPanel'
import { VisitSummaryCard } from '@/ui/admin/welcome/VisitSummaryCard'

import type { Route } from './+types/dashboard'

export const meta = titleMeta('欢迎')

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

// Must stay in lockstep with the `PAGE_SIZE` constant in
// `PendingModerationPanel.tsx` — the panel's pagination math reads the
// initial payload assuming this page size.
const PENDING_PAGE_SIZE = 3

// The whole dashboard data assembly is one fan-out across the
// comments/analytics/posts procedures (admin branch) plus the wire
// projections — orchestration stays in the loader, the procedures only
// hand over their domain rows. The `analytics.*` procedures are gated
// `adminProc` but only the admin branch calls them; `admin.posts.mySummary`
// is `authorProc` and `comments-authed.myCounts` is `authedProc`, so the
// author branch rides the same in-process caller.
export async function loader({ request, context }: Route.LoaderArgs) {
  const { caller, viewer } = createSsrCaller({ request, context })
  const ctx = { user: viewer ?? undefined, role: viewer?.role ?? null }
  // Defence-in-depth: `admin.layout` already gates author+, but
  // asserting here narrows `ctx.user` / `ctx.role` to non-null for the
  // loader body so the response shape is statically tight.
  requireRole(ctx, 'author')

  const admin = ctx.user.role === 'admin'

  // Fan out every dashboard query in one go. Each branch is a small
  // count(*) or LIMIT-5 select, so the round-trip wins dominate the
  // per-query CPU cost.
  const now = new Date()
  const nowSec = Math.floor(now.getTime() / 1000)
  const dayRange = { startAt: nowSec - 24 * 60 * 60, endAt: nowSec }
  const weekRange = computeDateRange('last-7d', now)
  // `analytics.*` inputs are strings (`parseAnalyticsInput` parseInts
  // them); `computeDateRange` yields unix seconds, so stringify.
  // The `comments-authed` group lives under the `comments` namespace
  // (`myCounts` is authedProc); `admin.posts.mySummary` is `authorProc`.
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
    name: ctx.user.name,
    role: ctx.user.role,
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
    // The mySummary procedure projects the same rows the old loader
    // projected (id stringified, title, published falls back to
    // updatedAt) — pass them through untouched.
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

function subscribeNoop(): () => void {
  return () => {
    // Greeting is read once from the client clock; nothing to unsubscribe.
  }
}

function getGreetingSnapshot(): string {
  return greetingForHour(new Date().getHours())
}

function getGreetingServerSnapshot(): string | null {
  return null
}

function useGreeting(): string | null {
  // Client-local greeting: SSR emits no greeting (server snapshot is null)
  // and hydration renders the same null, so the browser's own clock is the
  // only source — the container's timezone can no longer desync the text.
  return useSyncExternalStore<string | null>(subscribeNoop, getGreetingSnapshot, getGreetingServerSnapshot)
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
          <h1 className="text-2xl font-semibold">{greeting === null ? name : `${greeting}，${name}`}</h1>
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
      {isAdmin && <SearchReindexCard />}
      <div className="grid gap-4 lg:grid-cols-2">
        <RecentPublishedCard posts={recentPublished} />
        <RecentDraftsCard drafts={recentDrafts} />
      </div>
    </div>
  )
}
