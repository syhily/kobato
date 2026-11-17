import type { CountersDto, MetricGroup, MetricRow, MetricType } from '@kobato/shared/contracts/analytics.ts'

import { METRIC_GROUPS } from '@kobato/shared/contracts/analytics.ts'

import { Card } from '../../components/card'
import { Switch } from '../../components/switch'
import { cn } from '../../lib/cn'
import { useI18n } from '../../lib/I18nProvider'
import { AnalyticsStateProvider } from './analytics-state-context'
import { Counters } from './Counters'
import { DateRangePicker } from './DateRangePicker'
import { FiltersBar } from './Filters'
import { LocationsMap } from './LocationsMap'
import { MetricsGroup } from './MetricsGroup'
import { TrendTabs } from './TrendTabs'
import { type AnalyticsScope, type AnalyticsState } from './use-analytics-state'

// Shared by the site-wide overview and the per-post shells. URL state arrives as a
// prop from the route module (the only place useSearchParams may be read). Views/heatmap
// loader payloads are not threaded through — they would be bucketed in Etc/UTC while
// client queries refetch with the real clientTimezone.

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
  const { t } = useI18n()
  return (
    <AnalyticsStateProvider state={state}>
      <Card className="px-4 py-3 shadow-none">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <DateRangePicker
              preset={state.preset}
              range={state.range}
              onSelect={state.setPreset}
              onSelectRange={state.setRange}
            />
            <div className="flex items-center gap-2">
              <Switch
                id="analytics-include-unknown"
                checked={state.includeUnknown}
                onCheckedChange={(checked) => state.setIncludeUnknown(checked === true)}
              />
              <label htmlFor="analytics-include-unknown" className="cursor-pointer text-xs text-muted-foreground">
                {t('admin.analytics.includeUnknown')}
              </label>
            </div>
          </div>
          <FiltersBar filters={state.filters} onClear={state.clearFilter} onClearAll={state.clearAllFilters} />
        </div>
      </Card>

      <Counters initial={data.counters} scope={scope} />

      <TrendTabs scope={scope} />

      <section
        aria-label={t('admin.analytics.breakdownAria')}
        className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-6"
      >
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
