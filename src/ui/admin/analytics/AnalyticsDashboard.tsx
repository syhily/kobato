import type { CountersDto, MetricGroup, MetricRow, MetricType } from '@/shared/contracts/analytics'

import { METRIC_GROUPS } from '@/shared/contracts/analytics'
import { AnalyticsStateProvider } from '@/ui/admin/analytics/analytics-state-context'
import { Counters } from '@/ui/admin/analytics/Counters'
import { DateRangePicker } from '@/ui/admin/analytics/DateRangePicker'
import { FiltersBar } from '@/ui/admin/analytics/Filters'
import { LocationsMap } from '@/ui/admin/analytics/LocationsMap'
import { MetricsGroup } from '@/ui/admin/analytics/MetricsGroup'
import { TrendTabs } from '@/ui/admin/analytics/TrendTabs'
import { type AnalyticsScope, type AnalyticsState } from '@/ui/admin/analytics/use-analytics-state'
import { Card } from '@/ui/components/card'
import { cn } from '@/ui/lib/cn'

// The full analytics dashboard body shared by the site-wide overview and the
// per-post analytics shells (Slite's `analysis/Index.vue` + `metrics/Index.vue`
// composition): range picker + filters, counters, the trend/heatmap tabs,
// then the lg:grid-cols-12 metrics section (map col-span-8, location group
// col-span-4, the remaining four groups col-span-6).
//
// The URL state arrives as an explicit prop from the route module (the only
// place useSearchParams may be read) and is re-published to the deep panels
// through AnalyticsStateProvider. Neither the views nor the heatmap loader
// payload is threaded through: both would be bucketed in Etc/UTC while the
// client queries refetch with the real clientTimezone, so ViewsChart and
// Heatmap render their skeletons until those queries resolve.

export interface AnalyticsDashboardData {
  counters: CountersDto
  initialMetrics: Partial<Record<MetricType, MetricRow[]>>
}

export interface AnalyticsDashboardProps {
  data: AnalyticsDashboardData
  state: AnalyticsState
  scope?: AnalyticsScope
}

const GROUP_SPAN: Record<MetricGroup, string> = {
  location: 'lg:col-span-4',
  referer: 'lg:col-span-6',
  time: 'lg:col-span-6',
  device: 'lg:col-span-6',
  browser: 'lg:col-span-6',
}

export function AnalyticsDashboard({ data, state, scope }: AnalyticsDashboardProps) {
  return (
    <AnalyticsStateProvider state={state}>
      <Card className="px-4 py-3 shadow-none">
        <div className="flex flex-col gap-3">
          <DateRangePicker
            preset={state.preset}
            range={state.range}
            onSelect={state.setPreset}
            onSelectRange={state.setRange}
          />
          <FiltersBar filters={state.filters} onClear={state.clearFilter} onClearAll={state.clearAllFilters} />
        </div>
      </Card>

      <Counters initial={data.counters} scope={scope} />

      <TrendTabs scope={scope} />

      <section aria-label="详细分布" className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-6">
        <LocationsMap initial={data.initialMetrics.country} scope={scope} className="lg:col-span-8" />
        {METRIC_GROUPS.map((group) => (
          <MetricsGroup
            key={group}
            group={group}
            initial={data.initialMetrics}
            scope={scope}
            className={cn(GROUP_SPAN[group])}
          />
        ))}
      </section>
    </AnalyticsStateProvider>
  )
}
