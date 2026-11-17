import {
  adminAnalyticsMentionsOutputSchema,
  adminAnalyticsOverviewOutputSchema,
  adminAnalyticsSearchInputSchema,
} from '@kobato/shared/contracts/admin.ts'
import {
  METRIC_TYPE_VALUES,
  analyticsQuerySchema,
  countersDto,
  heatmapCellDto,
  metricRowDto,
  viewsDto,
  type AnalyticsQuery,
  type ResolvedAnalyticsQuery,
} from '@kobato/shared/contracts/analytics.ts'
import { z } from 'zod'

import { getAnalyticsReader } from '../../bootstrap/analytics-lifecycle'
import { queryCounters } from '../../domains/analytics/services/counters'
import { queryExportCsv } from '../../domains/analytics/services/export'
import { queryHeatmap } from '../../domains/analytics/services/heatmap'
import { queryMetric } from '../../domains/analytics/services/metric'
import { loadAnalyticsOverview } from '../../domains/analytics/services/overview'
import { parseAnalyticsSearch, resolveAnalyticsRange } from '../../domains/analytics/services/query-filter'
import { queryViews } from '../../domains/analytics/services/views'
import { adminProc } from '../orpc-base'

function resolve(input: AnalyticsQuery): ResolvedAnalyticsQuery {
  return { ...input, range: resolveAnalyticsRange(input) }
}

const metricsInput = analyticsQuerySchema.extend({
  type: z.enum(METRIC_TYPE_VALUES),
  limit: z.coerce.number().int().min(1).max(500).default(20),
})

const counters = adminProc
  .route({ method: 'GET', path: '/analytics/counters' })
  .input(analyticsQuerySchema)
  .output(countersDto)
  .handler(({ input }) => queryCounters(getAnalyticsReader(), resolve(input)))

const views = adminProc
  .route({ method: 'GET', path: '/analytics/views' })
  .input(analyticsQuerySchema)
  .output(viewsDto)
  .handler(({ input }) => queryViews(getAnalyticsReader(), resolve(input)))

const heatmap = adminProc
  .route({ method: 'GET', path: '/analytics/heatmap' })
  .input(analyticsQuerySchema)
  .output(z.array(heatmapCellDto))
  .handler(({ input }) => queryHeatmap(getAnalyticsReader(), resolve(input)))

const metrics = adminProc
  .route({ method: 'GET', path: '/analytics/metrics' })
  .input(metricsInput)
  .output(z.array(metricRowDto))
  .handler(({ input }) => {
    return queryMetric(getAnalyticsReader(), resolve(input), input.type, input.limit)
  })

/** CSV text export grouped by path (views / visitors / referers). */
const exportCsv = adminProc
  .route({ method: 'GET', path: '/analytics/export' })
  .input(analyticsQuerySchema)
  .output(z.string())
  .handler(({ input }) => queryExportCsv(getAnalyticsReader(), resolve(input)))

// Site-wide analytics first-paint fan-out behind `/admin/analytics/overview`;
// `search` carries the raw query string, parsed server-side.
const overview = adminProc
  .route({ method: 'GET', path: '/analytics/overview' })
  .input(adminAnalyticsSearchInputSchema)
  .output(adminAnalyticsOverviewOutputSchema)
  .handler(({ input }) =>
    loadAnalyticsOverview(getAnalyticsReader(), parseAnalyticsSearch(new URLSearchParams(input.search))),
  )

// Mentions page data: top 50 referers for the parsed range.
const mentions = adminProc
  .route({ method: 'GET', path: '/analytics/mentions' })
  .input(adminAnalyticsSearchInputSchema)
  .output(adminAnalyticsMentionsOutputSchema)
  .handler(async ({ input }) => {
    const referers = await queryMetric(
      getAnalyticsReader(),
      parseAnalyticsSearch(new URLSearchParams(input.search)),
      'referer',
      50,
    )
    return { referers }
  })

export const analyticsRouter = { counters, views, heatmap, metrics, export: exportCsv, overview, mentions }
