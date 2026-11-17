import type { CountersDto, MetricRow, MetricType, ResolvedAnalyticsQuery } from '@kobato/shared/contracts/analytics.ts'

import { METRIC_GROUPS, METRIC_GROUP_TABS } from '@kobato/shared/contracts/analytics.ts'

import type { AnalyticsReader } from './analytics-sql'

import { queryCounters } from './counters'
import { queryMetric } from './metric'

export interface AnalyticsOverviewData {
  counters: CountersDto
  initialMetrics: Partial<Record<MetricType, MetricRow[]>>
}

/**
 * First-paint fan-out: counters plus the first tab of every metric group. The
 * views series and the heatmap are deliberately absent — SSR buckets would be
 * UTC-bound, so the client fetches both in its own timezone.
 */
export async function loadAnalyticsOverview(
  reader: AnalyticsReader,
  input: ResolvedAnalyticsQuery,
): Promise<AnalyticsOverviewData> {
  const initialMetricTypes = METRIC_GROUPS.map((g) => METRIC_GROUP_TABS[g][0]!)

  const [counters, ...metricRows] = await Promise.all([
    queryCounters(reader, input),
    ...initialMetricTypes.map((t) => queryMetric(reader, input, t, 10)),
  ])

  const initialMetrics: Partial<Record<MetricType, MetricRow[]>> = {}
  initialMetricTypes.forEach((t, idx) => {
    initialMetrics[t] = metricRows[idx]!
  })

  return { counters, initialMetrics }
}
