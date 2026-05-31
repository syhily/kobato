import { useState } from 'react'
import { useLoaderData } from 'react-router'

import type { MetricGroup, MetricRow, MetricType } from '@/shared/contracts/analytics'

import {
  parseAnalyticsSearch,
  queryCounters,
  queryHeatmap,
  queryMetric,
  queryViews,
} from '@/server/domains/analytics/query'
import { getDbFromContext, getRouteRequestContext } from '@/server/domains/auth/context'
import { requireRole } from '@/server/domains/auth/rbac'
import { METRIC_GROUPS, METRIC_GROUP_TABS } from '@/shared/contracts/analytics'
import { Counters } from '@/ui/admin/analytics/Counters'
import { DateRangePicker } from '@/ui/admin/analytics/DateRangePicker'
import { FiltersBar } from '@/ui/admin/analytics/Filters'
import { Heatmap } from '@/ui/admin/analytics/Heatmap'
import { MetricsGroup } from '@/ui/admin/analytics/MetricsGroup'
import { useAnalyticsState } from '@/ui/admin/analytics/use-analytics-state'
import { ViewsChart } from '@/ui/admin/analytics/ViewsChart'
import { Card, CardContent } from '@/ui/components/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/components/tabs'

import type { Route } from './+types/overview'

// Overview tab. SSR loader fans out all dashboard queries in parallel
// so the first paint is fully populated; client-side fetchers
// (`MetricList`) take over once the URL state changes.

export async function loader({ request, context }: Route.LoaderArgs) {
  const ctx = getRouteRequestContext({ request, context })
  requireRole(ctx, 'admin')

  const url = new URL(request.url)
  const input = parseAnalyticsSearch(url.searchParams)

  const db = getDbFromContext({ request, context })

  // First-pass metric types: the first tab of each of the 5 groups.
  // The list components hydrate the other tabs on demand via their
  // own fetcher load.
  const initialMetricTypes = METRIC_GROUPS.map((g) => METRIC_GROUP_TABS[g][0]!)

  const [counters, views, heatmap, ...metricRows] = await Promise.all([
    queryCounters(db, input),
    queryViews(db, input),
    queryHeatmap(db, input),
    ...initialMetricTypes.map((t) => queryMetric(db, input, t, 10)),
  ])

  const initialMetrics: Partial<Record<MetricType, MetricRow[]>> = {}
  initialMetricTypes.forEach((t, idx) => {
    initialMetrics[t] = metricRows[idx]!
  })

  return { counters, views, heatmap, initialMetrics }
}

export default function WpAdminAnalyticsOverview() {
  const { counters, views, heatmap, initialMetrics } = useLoaderData<typeof loader>()
  const state = useAnalyticsState()
  const [chartTab, setChartTab] = useState<'views' | 'heatmap'>('views')

  return (
    <div className="flex flex-col gap-4">
      <Card className="px-4 py-3 shadow-none">
        <div className="flex flex-col gap-3">
          <DateRangePicker preset={state.preset} onSelect={state.setPreset} />
          <FiltersBar filters={state.filters} onClear={state.clearFilter} onClearAll={state.clearAllFilters} />
        </div>
      </Card>

      <Counters data={counters} />

      <Card className="gap-2 shadow-none">
        <CardContent className="flex flex-col gap-3 px-4 pb-4">
          <Tabs value={chartTab} onValueChange={(v) => setChartTab(v as 'views' | 'heatmap')}>
            <TabsList className="h-8">
              <TabsTrigger value="views">趋势</TabsTrigger>
              <TabsTrigger value="heatmap">热力</TabsTrigger>
            </TabsList>
            <TabsContent value="views" className="mt-3">
              <ViewsChart data={views} />
            </TabsContent>
            <TabsContent value="heatmap" className="mt-3">
              <Heatmap data={heatmap} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {METRIC_GROUPS.map((g: MetricGroup) => (
          <MetricsGroup key={g} group={g} initial={initialMetrics} />
        ))}
      </div>
    </div>
  )
}
