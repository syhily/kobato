import { useQuery } from '@tanstack/react-query'
import { lazy, Suspense } from 'react'

import type { TimeUnit } from '@/shared/contracts/analytics'

import { orpcQuery } from '@/client/api/orpc-query'
import { pickTimeUnit } from '@/shared/contracts/analytics'
import { useAnalyticsDashboardState } from '@/ui/admin/analytics/analytics-state-context'
import { AnalyticsQueryState } from '@/ui/admin/analytics/AnalyticsQueryState'
import { useAnalyticsQueryData } from '@/ui/admin/analytics/use-analytics-query'
import { buildAnalyticsInput, type AnalyticsScope } from '@/ui/admin/analytics/use-analytics-state'
import { Skeleton } from '@/ui/components/skeleton'
import { cn } from '@/ui/lib/cn'
import { useHydrated } from '@/ui/lib/use-hydrated'

// Views time series behind the hydration-safe chart gate (Slite's
// `analysis/ChartBody.vue`): the server and the client's first render both
// emit the static skeleton (the @unovis chunk is client-only); after
// hydration the lazy inner chart mounts behind an identical fallback.
// Like Heatmap, no loader payload is threaded through: it would be bucketed
// in Etc/UTC, so the skeleton stays up until the client-timezone-aware
// `analytics.views` query resolves — no UTC first-paint flash, and no stale
// labels to re-parse under a new unit on range change. The query sends the
// derived `unit` + `clientTimezone`; bucket labels are parsed per that unit,
// never as ISO instants.

const LazyViewsChartInner = lazy(() =>
  import('@/ui/admin/analytics/ViewsChartInner').then((module) => ({ default: module.ViewsChartInner })),
)

export interface ViewsChartProps {
  className?: string
  scope?: AnalyticsScope
}

export function ViewsChart({ className, scope }: ViewsChartProps) {
  const state = useAnalyticsDashboardState()
  const unit: TimeUnit = pickTimeUnit(state.range)
  const query = useQuery(
    orpcQuery.analytics.views.queryOptions({
      input: buildAnalyticsInput(state, { scope, unit }),
    }),
  )

  const { data, isError, refetching, retry } = useAnalyticsQueryData(query)
  const points = data?.points ?? null
  const ready = useHydrated()

  return (
    <AnalyticsQueryState
      isError={isError}
      onRetry={retry}
      isLoading={points === null}
      isEmpty={points !== null && points.length === 0}
      skeleton={<ViewsChartSkeleton className={className} />}
      className={cn('aspect-4/1 justify-center', className)}
    >
      {points !== null && ready ? (
        <div className={cn(refetching && 'opacity-60', 'transition-opacity motion-reduce:transition-none')}>
          <Suspense fallback={<ViewsChartSkeleton className={className} />}>
            <LazyViewsChartInner points={points} unit={unit} className={className} />
          </Suspense>
        </div>
      ) : (
        <ViewsChartSkeleton className={className} />
      )}
    </AnalyticsQueryState>
  )
}

// Static pre-chart placeholder — byte-identical between SSR, the first
// client render, and the lazy-boundary fallback (React #418 rule).
function ViewsChartSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('relative aspect-4/1 w-full', className)} role="status" aria-busy="true">
      <span className="sr-only">加载中</span>
      <div aria-hidden="true" className="absolute inset-0">
        <div className="absolute inset-y-2 right-2 left-6 overflow-hidden border-b border-l border-border">
          <div className="absolute top-1/3 w-full border-t border-border/60" />
          <div className="absolute top-2/3 w-full border-t border-border/60" />
          <Skeleton className="absolute inset-x-2 bottom-1 h-3/4 rounded-sm opacity-70 [clip-path:polygon(0_82%,18%_62%,36%_72%,54%_24%,72%_48%,88%_10%,100%_34%,100%_100%,0_100%)]" />
        </div>
        <div className="absolute right-2 bottom-0 left-6 flex justify-between">
          <Skeleton className="h-1.5 w-8 rounded-sm" />
          <Skeleton className="h-1.5 w-8 rounded-sm" />
          <Skeleton className="h-1.5 w-8 rounded-sm" />
          <Skeleton className="h-1.5 w-8 rounded-sm" />
        </div>
      </div>
    </div>
  )
}
