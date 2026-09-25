import { useQuery } from '@tanstack/react-query'
import { lazy, Suspense } from 'react'

import type { MetricRow } from '@/shared/contracts/analytics'

import { orpcQuery } from '@/client/api/orpc-query'
import { useAnalyticsDashboardState } from '@/ui/admin/analytics/analytics-state-context'
import { AnalyticsQueryState } from '@/ui/admin/analytics/AnalyticsQueryState'
import { useAnalyticsQueryData } from '@/ui/admin/analytics/use-analytics-query'
import { buildAnalyticsInput, type AnalyticsScope } from '@/ui/admin/analytics/use-analytics-state'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/ui/components/card'
import { Skeleton } from '@/ui/components/skeleton'
import { cn } from '@/ui/lib/cn'
import { useHydrated } from '@/ui/lib/use-hydrated'

// Country choropleth world map (Slite's `metrics/Locations.vue`) behind the
// hydration-safe gate: SSR and the first client render emit the static
// skeleton; the @unovis map (with WorldMapTopoJSON) mounts client-side.
// Data comes from `analytics.metrics` type=country — ISO alpha-2 codes map
// 1:1 onto the topojson feature ids.

const LazyLocationsMapInner = lazy(() =>
  import('@/ui/admin/analytics/LocationsMapInner').then((module) => ({ default: module.LocationsMapInner })),
)

export interface LocationsMapProps {
  initial?: MetricRow[]
  className?: string
  scope?: AnalyticsScope
}

export function LocationsMap({ initial, className, scope }: LocationsMapProps) {
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
        <CardTitle className="text-sm font-semibold">地理位置</CardTitle>
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

// Static pre-map placeholder — byte-identical between SSR, the first client
// render, and the lazy-boundary fallback (React #418 rule).
function LocationsMapSkeleton() {
  return (
    <div className="absolute inset-0 overflow-hidden" role="status" aria-busy="true">
      <span className="sr-only">加载中</span>
      <Skeleton aria-hidden className="size-full rounded-none" />
    </div>
  )
}
