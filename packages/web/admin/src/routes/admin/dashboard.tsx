import { orpc } from '@kobato/api/browser/client'
import { ROLE_LABEL_KEYS } from '@kobato/base/auth/roles'
import { computeDateRange } from '@kobato/base/utils/date-range'
import { type I18nValue, useI18n } from '@kobato/ui/lib/I18nProvider'
import { awaitRootBootstrap, requireRoleFromBootstrap } from '@kobato/web-admin/lib/root-bootstrap'
import { titleMeta } from '@kobato/web-admin/seo/title-meta'
import { BodyProjectionCard } from '@kobato/web-admin/ui/dashboard/BodyProjectionCard'
import { pickEmptyStateLineId } from '@kobato/web-admin/ui/dashboard/empty-state-lines'
import { PendingModerationPanel } from '@kobato/web-admin/ui/dashboard/PendingModerationPanel'
import { QuickActions } from '@kobato/web-admin/ui/dashboard/QuickActions'
import { RecentDraftsCard } from '@kobato/web-admin/ui/dashboard/RecentDraftsCard'
import { RecentPublishedCard } from '@kobato/web-admin/ui/dashboard/RecentPublishedCard'
import { SearchReindexCard } from '@kobato/web-admin/ui/dashboard/SearchReindexCard'
import { StatsGrid } from '@kobato/web-admin/ui/dashboard/StatsGrid'
import { VisitSummaryCard } from '@kobato/web-admin/ui/dashboard/VisitSummaryCard'
import { Suspense, use, useState } from 'react'
import { browser } from 'react-dom'

import type { Route } from './+types/dashboard'

export const meta = titleMeta('meta.title.admin.dashboard')

const PENDING_PAGE_SIZE = 3

export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  const boot = await awaitRootBootstrap()
  requireRoleFromBootstrap(boot, 'author', { pathname: new URL(request.url).pathname })
  const user = boot.currentUser
  const admin = user?.role === 'admin'

  const now = new Date()
  const nowSec = Math.floor(now.getTime() / 1000)
  const dayRange = { startAt: nowSec - 24 * 60 * 60, endAt: nowSec }
  const weekRange = computeDateRange('last-7d', now)
  const [pendingModeration, visitSummary, weeklyTrend, mySummary, myCommentCounts] = await Promise.all([
    admin
      ? orpc.admin.comments.listPendingDashboard({ kind: 'all', offset: 0, limit: PENDING_PAGE_SIZE })
      : Promise.resolve(null),
    admin
      ? orpc.admin.analytics.counters({ startAt: String(dayRange.startAt), endAt: String(dayRange.endAt) })
      : Promise.resolve(null),
    admin
      ? orpc.admin.analytics.views({ startAt: String(weekRange.startAt), endAt: String(weekRange.endAt) })
      : Promise.resolve(null),
    orpc.admin.posts.mySummary(),
    orpc.account.comments.myCounts(),
  ])

  return {
    name: user?.name ?? '',
    role: user?.role ?? 'visitor',
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
