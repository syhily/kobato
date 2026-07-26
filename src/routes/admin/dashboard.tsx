import { useSyncExternalStore } from 'react'

import { loadAdminDashboardData } from '@/server/http/loaders/dashboard'
import { titleMeta } from '@/shared/seo/title-meta'
import { roleLabel } from '@/shared/utils/roles'
import { QuickActions } from '@/ui/admin/dashboard/QuickActions'
import { RecentDraftsCard } from '@/ui/admin/dashboard/RecentDraftsCard'
import { RecentPublishedCard } from '@/ui/admin/dashboard/RecentPublishedCard'
import { StatsGrid } from '@/ui/admin/dashboard/StatsGrid'
import { PendingModerationPanel } from '@/ui/admin/welcome/PendingModerationPanel'
import { VisitSummaryCard } from '@/ui/admin/welcome/VisitSummaryCard'

import type { Route } from './+types/dashboard'

export const meta = titleMeta('欢迎')

// The data assembly (an 8-way fan-out across the comments / analytics /
// posts domain services plus the DTO projections) lives in
// `@/server/http/loaders/dashboard` — this route is wiring only.
export async function loader({ request, context }: Route.LoaderArgs) {
  return loadAdminDashboardData({ request, context })
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
      <div className="grid gap-4 lg:grid-cols-2">
        <RecentPublishedCard posts={recentPublished} />
        <RecentDraftsCard drafts={recentDrafts} />
      </div>
    </div>
  )
}
