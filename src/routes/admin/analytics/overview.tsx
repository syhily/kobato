import { useState } from 'react'

function isChartTab(value: string): value is 'views' | 'heatmap' {
  return value === 'views' || value === 'heatmap'
}

import type { MetricGroup } from '@/shared/contracts/analytics'

import { loadAdminAnalyticsOverview } from '@/server/http/loaders/analytics-overview'
import { METRIC_GROUPS } from '@/shared/contracts/analytics'
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

// Overview tab. The loader fans out all dashboard queries in parallel
// (via `@/server/http/loaders/analytics-overview` → the domain's
// `loadAnalyticsOverview`) so the first paint is fully populated;
// client-side fetchers (`MetricList`) take over once the URL state
// changes.
export async function loader({ request, context }: Route.LoaderArgs) {
  return loadAdminAnalyticsOverview({ request, context })
}

export default function WpAdminAnalyticsOverview({ loaderData }: Route.ComponentProps) {
  const { counters, views, heatmap, initialMetrics } = loaderData
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
          <Tabs
            value={chartTab}
            onValueChange={(v) => {
              if (typeof v === 'string' && isChartTab(v)) {
                setChartTab(v)
              }
            }}
          >
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
