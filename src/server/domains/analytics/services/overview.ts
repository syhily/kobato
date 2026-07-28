import type { AnalyticsQueryInput } from '@/server/domains/analytics/services/query-parser'
import type { Database } from '@/server/infra/db/database'
import type { CountersDto, HeatmapCell, MetricRow, MetricType, ViewsPoint } from '@/shared/contracts/analytics'

import { queryCounters } from '@/server/domains/analytics/services/counters'
import { queryHeatmap } from '@/server/domains/analytics/services/heatmap'
import { queryMetric } from '@/server/domains/analytics/services/metric'
import { queryViews } from '@/server/domains/analytics/services/views'
import { METRIC_GROUPS, METRIC_GROUP_TABS } from '@/shared/contracts/analytics'

export interface AnalyticsOverviewData {
  counters: CountersDto
  views: ViewsPoint[]
  heatmap: HeatmapCell[]
  initialMetrics: Partial<Record<MetricType, MetricRow[]>>
}

/**
 * The first-paint analytics fan-out: counters + views + heatmap plus the
 * first tab of every metric group, all in one `Promise.all`. The
 * remaining tabs hydrate on demand through the oRPC endpoints. This is
 * the single orchestration behind both analytics pages — the scope
 * (site-wide vs per-post) lives entirely in `input`, so callers only
 * resolve their `AnalyticsQueryInput` and hand it over.
 */
export async function loadAnalyticsOverview(db: Database, input: AnalyticsQueryInput): Promise<AnalyticsOverviewData> {
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
