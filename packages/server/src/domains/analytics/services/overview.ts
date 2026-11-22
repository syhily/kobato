import type { AnalyticsOverviewData, MetricRow, MetricType } from '@kobato/api/contracts/analytics'
import type { AnalyticsReader } from '@kobato/db/duckdb/connection'
import type { ResolvedAnalyticsQuery } from '@kobato/db/duckdb/queries/types'

import { METRIC_GROUPS, METRIC_GROUP_TABS } from '@kobato/api/contracts/analytics'
import { queryCounters } from '@kobato/db/duckdb/queries/counters'
import { queryMetric } from '@kobato/db/duckdb/queries/metric'

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
