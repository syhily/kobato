import { ORPCError } from '@orpc/server'
import { z } from 'zod'

import { queryCounters } from '@/server/domains/analytics/services/counters'
import { queryHeatmap } from '@/server/domains/analytics/services/heatmap'
import { queryMetric } from '@/server/domains/analytics/services/metric'
import { parseAnalyticsInput } from '@/server/domains/analytics/services/query-parser'
import { queryViews } from '@/server/domains/analytics/services/views'
import { adminProc } from '@/server/http/orpc-base'
import { METRIC_TYPE_VALUES, METRIC_TYPES, PRESET_KEY_VALUES } from '@/shared/contracts/analytics'

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

const METRIC_SET = new Set<string>(METRIC_TYPES)

const counters = adminProc
  .route({ method: 'GET', path: '/analytics/counters' })
  .input(analyticsInput)
  .output(countersOutput)
  .handler(({ input, context }) => queryCounters(context.db, parseAnalyticsInput(input)))

const views = adminProc
  .route({ method: 'GET', path: '/analytics/views' })
  .input(analyticsInput)
  .output(z.array(viewsPointOutput))
  .handler(({ input, context }) => queryViews(context.db, parseAnalyticsInput(input)))

const heatmap = adminProc
  .route({ method: 'GET', path: '/analytics/heatmap' })
  .input(analyticsInput)
  .output(z.array(heatmapCellOutput))
  .handler(({ input, context }) => queryHeatmap(context.db, parseAnalyticsInput(input)))

const metrics = adminProc
  .route({ method: 'GET', path: '/analytics/metrics' })
  .input(metricsInput)
  .output(z.array(metricRowOutput))
  .handler(({ input, context }) => {
    if (!METRIC_SET.has(input.type)) {
      throw new ORPCError('BAD_REQUEST', { message: `unknown metric type: ${input.type}` })
    }
    return queryMetric(context.db, parseAnalyticsInput(input), input.type, input.limit)
  })

export const analyticsRouter = { counters, views, heatmap, metrics }
