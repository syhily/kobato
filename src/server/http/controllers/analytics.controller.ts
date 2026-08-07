import { z } from 'zod'

import { getAnalyticsReader } from '@/server/bootstrap/analytics-lifecycle'
import { queryCounters } from '@/server/domains/analytics/services/counters'
import { queryHeatmap } from '@/server/domains/analytics/services/heatmap'
import { queryMetric } from '@/server/domains/analytics/services/metric'
import { loadAnalyticsOverview } from '@/server/domains/analytics/services/overview'
import { parseAnalyticsInput, parseAnalyticsSearch } from '@/server/domains/analytics/services/query-parser'
import { queryViews } from '@/server/domains/analytics/services/views'
import { adminProc } from '@/server/http/orpc-base'
import {
  adminAnalyticsMentionsOutputSchema,
  adminAnalyticsOverviewOutputSchema,
  adminAnalyticsSearchInputSchema,
} from '@/shared/contracts/admin'
import { METRIC_TYPE_VALUES, PRESET_KEY_VALUES } from '@/shared/contracts/analytics'

const presetKey = z.enum(PRESET_KEY_VALUES)

const analyticsInput = z.object({
  preset: presetKey.optional(),
  startAt: z.string().optional(),
  endAt: z.string().optional(),
  filters: z.string().optional(),
  entityType: z.enum(['post', 'page']).optional(),
  entityId: z.string().optional(),
})

const metricsInput = analyticsInput.extend({
  type: z.enum(METRIC_TYPE_VALUES),
  limit: z.number().int().min(1).max(100).default(20),
})

const countersOutput = z.object({
  visits: z.number().int().nonnegative(),
  visitors: z.number().int().nonnegative(),
  referers: z.number().int().nonnegative(),
})

const viewsPointOutput = z.object({
  time: z.string(),
  visits: z.number().int().nonnegative(),
  visitors: z.number().int().nonnegative(),
})

const heatmapCellOutput = z.object({
  weekday: z.number().int().min(0).max(6),
  hour: z.number().int().min(0).max(23),
  visits: z.number().int().nonnegative(),
  visitors: z.number().int().nonnegative(),
})

const metricRowOutput = z.object({
  name: z.string(),
  visits: z.number().int().nonnegative(),
  visitors: z.number().int().nonnegative(),
})

const counters = adminProc
  .route({ method: 'GET', path: '/analytics/counters' })
  .input(analyticsInput)
  .output(countersOutput)
  .handler(({ input }) => queryCounters(getAnalyticsReader(), parseAnalyticsInput(input)))

const views = adminProc
  .route({ method: 'GET', path: '/analytics/views' })
  .input(analyticsInput)
  .output(z.array(viewsPointOutput))
  .handler(({ input }) => queryViews(getAnalyticsReader(), parseAnalyticsInput(input)))

const heatmap = adminProc
  .route({ method: 'GET', path: '/analytics/heatmap' })
  .input(analyticsInput)
  .output(z.array(heatmapCellOutput))
  .handler(({ input }) => queryHeatmap(getAnalyticsReader(), parseAnalyticsInput(input)))

const metrics = adminProc
  .route({ method: 'GET', path: '/analytics/metrics' })
  .input(metricsInput)
  .output(z.array(metricRowOutput))
  .handler(({ input }) => {
    // `input.type` is already validated by the zod enum at the wire
    // boundary — no second guard here.
    return queryMetric(getAnalyticsReader(), parseAnalyticsInput(input), input.type, input.limit)
  })

// Site-wide analytics first-paint fan-out (counters + views + heatmap +
// first metric tab of every group), behind `/admin/analytics/overview`.
// `search` carries the raw query string; the URL grammar stays inside
// `parseAnalyticsSearch` (server-side).
const overview = adminProc
  .route({ method: 'GET', path: '/analytics/overview' })
  .input(adminAnalyticsSearchInputSchema)
  .output(adminAnalyticsOverviewOutputSchema)
  .handler(({ input }) =>
    loadAnalyticsOverview(getAnalyticsReader(), parseAnalyticsSearch(new URLSearchParams(input.search))),
  )

// Mentions page data: top 50 referers for the parsed range — the same
// `queryMetric('referer', 50)` shape `loaders/mentions.ts` produced.
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

export const analyticsRouter = { counters, views, heatmap, metrics, overview, mentions }
