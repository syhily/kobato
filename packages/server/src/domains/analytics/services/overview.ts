import type { AnalyticsOverviewData, MetricRow, MetricType } from '@kobato/contracts/analytics'
import type { ResolvedAnalyticsQuery } from '@kobato/db/duckdb/queries/types'
import type { AnalyticsReader } from '@kobato/db/duckdb/query'

import { METRIC_GROUPS, METRIC_GROUP_TABS } from '@kobato/contracts/analytics'
import { queryCounters } from '@kobato/db/duckdb/queries/counters'
import { queryMetric } from '@kobato/db/duckdb/queries/metric'

/**
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
