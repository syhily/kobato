import type { AnalyticsQuery } from '@kobato/contracts/analytics.ts'
import type { ResolvedAnalyticsQuery } from '@kobato/db/duckdb/queries/types.ts'

import { analyticsContract } from '@kobato/api/analytics.ts'
import { queryCounters } from '@kobato/db/duckdb/queries/counters.ts'
import { queryHeatmap } from '@kobato/db/duckdb/queries/heatmap.ts'
import { queryMetric } from '@kobato/db/duckdb/queries/metric.ts'
import { resolveAnalyticsRange } from '@kobato/db/duckdb/queries/query-filter.ts'
import { queryViews } from '@kobato/db/duckdb/queries/views.ts'
import { getAnalyticsReader } from '@kobato/server/bootstrap/analytics-lifecycle.ts'
import { queryExportCsv } from '@kobato/server/domains/analytics/services/export.ts'
import { loadAnalyticsOverview } from '@kobato/server/domains/analytics/services/overview.ts'
import { parseAnalyticsSearch } from '@kobato/server/domains/analytics/services/query-input.ts'
import { implementAdmin } from '@kobato/server/http/orpc-base.ts'

const impl = implementAdmin(analyticsContract)

function resolve(input: AnalyticsQuery): ResolvedAnalyticsQuery {
  return { ...input, range: resolveAnalyticsRange(input) }
}

const counters = impl.counters.handler(({ input }) => queryCounters(getAnalyticsReader(), resolve(input)))

const views = impl.views.handler(({ input }) => queryViews(getAnalyticsReader(), resolve(input)))

const heatmap = impl.heatmap.handler(({ input }) => queryHeatmap(getAnalyticsReader(), resolve(input)))

const metrics = impl.metrics.handler(({ input }) => {
  return queryMetric(getAnalyticsReader(), resolve(input), input.type, input.limit)
})

const exportCsv = impl.export.handler(({ input }) => queryExportCsv(getAnalyticsReader(), resolve(input)))

const overview = impl.overview.handler(({ input }) =>
  loadAnalyticsOverview(getAnalyticsReader(), parseAnalyticsSearch(new URLSearchParams(input.search))),
)

const mentions = impl.mentions.handler(async ({ input }) => {
  const referers = await queryMetric(
    getAnalyticsReader(),
    parseAnalyticsSearch(new URLSearchParams(input.search)),
    'referer',
    50,
  )
  return { referers }
})

export const analyticsRouter = impl.router({
  counters,
  views,
  heatmap,
  metrics,
  export: exportCsv,
  overview,
  mentions,
})
