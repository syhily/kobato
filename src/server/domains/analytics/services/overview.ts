import type { AnalyticsReader } from '@/server/domains/analytics/services/analytics-sql'
import type { CountersDto, MetricRow, MetricType, ResolvedAnalyticsQuery } from '@/shared/contracts/analytics'

import { queryCounters } from '@/server/domains/analytics/services/counters'
import { queryMetric } from '@/server/domains/analytics/services/metric'
import { METRIC_GROUPS, METRIC_GROUP_TABS } from '@/shared/contracts/analytics'

export interface AnalyticsOverviewData {
  counters: CountersDto
  initialMetrics: Partial<Record<MetricType, MetricRow[]>>
}

/**
 * First-paint fan-out behind both analytics pages: counters plus the first
 * tab of every metric group in one `Promise.all`. The views series and the
 * heatmap are deliberately absent — SSR buckets would be UTC-bound, so the
 * client fetches both with its real timezone.
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
