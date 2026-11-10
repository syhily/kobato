import { Suspense, use, useState } from 'react'
import { browser } from 'react-dom'

import { requireRole } from '@/server/domains/auth/rbac'
import { createSsrCaller } from '@/server/http/ssr-caller'
import { computeDateRange } from '@/shared/contracts/analytics'
import { pickEmptyStateLineId } from '@/shared/contracts/dashboard'
import { titleMeta } from '@/shared/seo/title-meta'
import { ROLE_LABEL_KEYS } from '@/shared/utils/roles'
import { BodyProjectionCard } from '@/ui/admin/dashboard/BodyProjectionCard'
import { QuickActions } from '@/ui/admin/dashboard/QuickActions'
import { RecentDraftsCard } from '@/ui/admin/dashboard/RecentDraftsCard'
import { RecentPublishedCard } from '@/ui/admin/dashboard/RecentPublishedCard'
import { SearchReindexCard } from '@/ui/admin/dashboard/SearchReindexCard'
import { StatsGrid } from '@/ui/admin/dashboard/StatsGrid'
import { PendingModerationPanel } from '@/ui/admin/welcome/PendingModerationPanel'
import { VisitSummaryCard } from '@/ui/admin/welcome/VisitSummaryCard'
import { type I18nValue, useI18n } from '@/ui/lib/I18nProvider'

import type { Route } from './+types/dashboard'

export const meta = titleMeta('meta.title.admin.dashboard')

// Keep in lockstep with the `PAGE_SIZE` constant in `PendingModerationPanel.tsx` — the panel's pagination assumes this size.
const PENDING_PAGE_SIZE = 3

// `analytics.*` inputs are strings (`parseAnalyticsInput` parseInts them); `computeDateRange` yields unix seconds.
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
    emptyStateLineId: pickEmptyStateLineId(),
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

function greetingForHour(hour: number, t: I18nValue['t']): string {
  if (hour >= 23 || hour < 5) {
    return t('admin.dashboard.greeting.late')
  }
  if (hour < 11) {
    return t('admin.dashboard.greeting.morning')
  }
  if (hour < 14) {
    return t('admin.dashboard.greeting.noon')
  }
  if (hour < 18) {
    return t('admin.dashboard.greeting.afternoon')
  }
  return t('admin.dashboard.greeting.evening')
}

function Greeting({ name }: { name: string }) {
  use(browser())
  const { t } = useI18n()
  // Client-only once the boundary above resolves, so the hour initializes once from the client clock.
  const [hour] = useState(() => new Date().getHours())
  return <>{t('admin.dashboard.greeting.line', { greeting: greetingForHour(hour, t), name })}</>
}

export default function DashboardRoute({ loaderData }: Route.ComponentProps) {
  const { t } = useI18n()
  const {
    name,
    role,
    pendingModeration,
    visitSummary,
    weeklyTrend,
    emptyStateLineId,
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
          <p className="mt-1 text-muted-foreground">{t('admin.dashboard.role', { role: t(ROLE_LABEL_KEYS[role]) })}</p>
        </div>
        <QuickActions />
      </div>
      {isAdmin && visitSummary !== null && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <VisitSummaryCard summary={visitSummary} weeklyTrend={weeklyTrend} />
          {pendingModeration !== null && (
            <PendingModerationPanel initial={pendingModeration} emptyStateLineId={emptyStateLineId} />
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
