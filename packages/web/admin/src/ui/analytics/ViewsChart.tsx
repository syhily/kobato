import type { TimeUnit } from '@kobato/utils/date-range.ts'

import { Skeleton } from '@kobato/ui/components/skeleton.tsx'
import { cn } from '@kobato/ui/lib/cn.ts'
import { useI18n } from '@kobato/ui/lib/I18nProvider.tsx'
import { useHydrated } from '@kobato/ui/lib/use-hydrated.ts'
import { pickTimeUnit } from '@kobato/utils/date-range.ts'
import { useAnalyticsDashboardState } from '@kobato/web-admin/ui/analytics/analytics-state-context.tsx'
import { AnalyticsQueryState } from '@kobato/web-admin/ui/analytics/AnalyticsQueryState.tsx'
import { useAnalyticsQueryData } from '@kobato/web-admin/ui/analytics/use-analytics-query.ts'
import { buildAnalyticsInput, type AnalyticsScope } from '@kobato/web-admin/ui/analytics/use-analytics-state.ts'
import { orpcQuery } from '@kobato/web-client/api/orpc-query.ts'
import { useQuery } from '@tanstack/react-query'
import { lazy, Suspense } from 'react'

const LazyViewsChartInner = lazy(() =>
  import('@kobato/web-admin/ui/analytics/ViewsChartInner.tsx').then((module) => ({ default: module.ViewsChartInner })),
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

function ViewsChartSkeleton({ className }: { className?: string }) {
  const { t } = useI18n()
  return (
    <div className={cn('relative aspect-4/1 w-full', className)} role="status" aria-busy="true">
      <span className="sr-only">{t('common.state.loading')}</span>
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
