import { useQuery } from '@tanstack/react-query'

import type { MetricRow, MetricType } from '@/shared/contracts/analytics'

import { orpcQuery } from '@/client/api/orpc-query'
import { useAnalyticsDashboardState } from '@/ui/admin/analytics/analytics-state-context'
import { AnalyticsQueryState } from '@/ui/admin/analytics/AnalyticsQueryState'
import { MetricDetailsDialog } from '@/ui/admin/analytics/MetricDetailsDialog'
import { MetricRows } from '@/ui/admin/analytics/MetricRows'
import { useAnalyticsQueryData } from '@/ui/admin/analytics/use-analytics-query'
import { buildAnalyticsInput, type AnalyticsScope } from '@/ui/admin/analytics/use-analytics-state'
import { Skeleton } from '@/ui/components/skeleton'
import { cn } from '@/ui/lib/cn'
import { skeletonKeys } from '@/ui/lib/skeleton-keys'

// Self-fetching top-N panel for one metric dimension (Slite's
// `metrics/Metric.vue`): top 10 rows in the card, the full 500-row set
// behind the details dialog; percent shares are computed over the full set.
// Row clicks push a per-dimension filter through the URL state.

export interface MetricListProps {
  type: MetricType
  title: string
  initial?: MetricRow[]
  className?: string
  scope?: AnalyticsScope
}

export function MetricList({ type, title, initial, className, scope }: MetricListProps) {
  const state = useAnalyticsDashboardState()
  const query = useQuery(
    orpcQuery.analytics.metrics.queryOptions({
      input: { ...buildAnalyticsInput(state, { scope, limit: 500 }), type },
    }),
  )

  const { data: rows, hasLoaded, isError, refetching, isFetching, retry } = useAnalyticsQueryData(query, initial)
  const total = (rows ?? []).reduce((sum, row) => sum + row.visits, 0)

  return (
    <AnalyticsQueryState
      isError={isError}
      onRetry={retry}
      isLoading={!hasLoaded}
      isEmpty={rows !== null && rows.length === 0}
      skeleton={<MetricListSkeleton className={className} />}
      className={cn('min-h-40 flex-1 flex-col justify-center', className)}
    >
      <div
        className={cn('flex min-h-0 flex-1 flex-col transition-opacity motion-reduce:transition-none', className)}
        aria-busy={isFetching}
      >
        <div className={cn('min-h-0 flex-1 overflow-y-auto', refetching && 'opacity-60')}>
          <MetricRows rows={(rows ?? []).slice(0, 10)} total={total} type={type} onSelect={state.setFilter} />
        </div>
        <div className="shrink-0 border-t">
          <MetricDetailsDialog title={title} rows={rows ?? []} total={total} type={type} onSelect={state.setFilter} />
        </div>
      </div>
    </AnalyticsQueryState>
  )
}

function MetricListSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-col', className)} role="status" aria-busy="true">
      <span className="sr-only">加载中</span>
      <div className="flex h-10 items-center justify-between px-4">
        <Skeleton className="h-4 w-24 rounded-full" />
        <Skeleton className="h-4 w-16 rounded-full" />
      </div>
      {skeletonKeys(7).map((key) => (
        <div key={key} className="flex flex-col gap-2 border-b px-4 py-2" aria-hidden>
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-4 w-16 shrink-0" />
          </div>
          <Skeleton className="h-2 w-full rounded-full" />
        </div>
      ))}
    </div>
  )
}
