import type { MetricRow } from '@kobato/contracts/analytics'

import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@kobato/ui/components/card'
import { Skeleton } from '@kobato/ui/components/skeleton'
import { cn } from '@kobato/ui/lib/cn'
import { useI18n } from '@kobato/ui/lib/I18nProvider'
import { useHydrated } from '@kobato/ui/lib/use-hydrated'
import { useAnalyticsDashboardState } from '@kobato/web-admin/ui/analytics/analytics-state-context'
import { AnalyticsQueryState } from '@kobato/web-admin/ui/analytics/AnalyticsQueryState'
import { useAnalyticsQueryData } from '@kobato/web-admin/ui/analytics/use-analytics-query'
import { buildAnalyticsInput, type AnalyticsScope } from '@kobato/web-admin/ui/analytics/use-analytics-state'
import { orpcQuery } from '@kobato/web-client/api/orpc-query'
import { useQuery } from '@tanstack/react-query'
import { lazy, Suspense } from 'react'

const LazyLocationsMapInner = lazy(() =>
  import('@kobato/web-admin/ui/analytics/LocationsMapInner').then((module) => ({
    default: module.LocationsMapInner,
  })),
)

export interface LocationsMapProps {
  initial?: MetricRow[]
  className?: string
  scope?: AnalyticsScope
}

export function LocationsMap({ initial, className, scope }: LocationsMapProps) {
  const { t } = useI18n()
  const state = useAnalyticsDashboardState()
  const query = useQuery(
    orpcQuery.analytics.metrics.queryOptions({
      input: { ...buildAnalyticsInput(state, { scope, limit: 500 }), type: 'country' as const },
    }),
  )

  const { data: rows, isError, refetching, isFetching, retry } = useAnalyticsQueryData(query, initial)
  const ready = useHydrated()

  return (
    <Card className={cn('flex flex-col gap-2 shadow-none lg:h-[500px]', className)}>
      <CardHeader>
        <CardTitle className="text-sm font-semibold">{t('admin.analytics.locations.title')}</CardTitle>
        <CardAction>
          <a
            href="https://db-ip.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            IP Geolocation by DB-IP
          </a>
        </CardAction>
      </CardHeader>
      <CardContent className="relative min-h-64 flex-1" aria-busy={isFetching}>
        <AnalyticsQueryState
          isError={isError}
          onRetry={retry}
          isLoading={rows === null || !ready}
          isEmpty={rows !== null && rows.length === 0}
          skeleton={<LocationsMapSkeleton />}
          className="absolute inset-0 flex-col justify-center"
        >
          <div className={cn('absolute inset-0', refetching && 'opacity-60')}>
            <Suspense fallback={<LocationsMapSkeleton />}>
              <LazyLocationsMapInner rows={rows ?? []} />
            </Suspense>
          </div>
        </AnalyticsQueryState>
      </CardContent>
    </Card>
  )
}

function LocationsMapSkeleton() {
  const { t } = useI18n()
  return (
    <div className="absolute inset-0 overflow-hidden" role="status" aria-busy="true">
      <span className="sr-only">{t('common.state.loading')}</span>
      <Skeleton aria-hidden className="size-full rounded-none" />
    </div>
  )
}
