import type { AnalyticsQuery } from '@kobato/api/contracts/admin/analytics'
import type { ResolvedAnalyticsQuery } from '@kobato/db/duckdb/queries/types'

import { analyticsContract } from '@kobato/api/rpc/admin/analytics'
import { queryCounters } from '@kobato/db/duckdb/queries/counters'
import { queryHeatmap } from '@kobato/db/duckdb/queries/heatmap'
import { queryMetric } from '@kobato/db/duckdb/queries/metric'
import { resolveAnalyticsRange } from '@kobato/db/duckdb/queries/query-filter'
import { queryViews } from '@kobato/db/duckdb/queries/views'
import { getAnalyticsReader } from '@kobato/server/bootstrap/analytics-lifecycle'
import { queryExportCsv } from '@kobato/server/domains/analytics/services/export'
import { loadAnalyticsOverview } from '@kobato/server/domains/analytics/services/overview'
import { parseAnalyticsSearch } from '@kobato/server/domains/analytics/services/query-input'
import { realtimeEventBatches } from '@kobato/server/domains/analytics/services/realtime'
import { realtimeConnectionKey } from '@kobato/server/domains/analytics/services/realtime-connections'
import { implementAdmin } from '@kobato/server/http/orpc-base'

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

const events = impl.events.handler(({ input, context, signal }) => {
  const connectionKey = realtimeConnectionKey(context.session.id, context.clientAddress)
  return realtimeEventBatches(getAnalyticsReader, connectionKey, input.since, signal ?? context.request.signal)
})

export const analyticsRouter = impl.router({
  counters,
  views,
  heatmap,
  metrics,
  export: exportCsv,
  overview,
  mentions,
  events,
})
