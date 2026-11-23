import {
  adminAnalyticsMentionsOutputSchema,
  adminAnalyticsOverviewOutputSchema,
  adminAnalyticsSearchInputSchema,
  analyticsExportOutputSchema,
  analyticsHeatmapOutputSchema,
  analyticsMetricsInputSchema,
  analyticsMetricsOutputSchema,
  analyticsQuerySchema,
  countersDto,
  viewsDto,
} from '@kobato/api/contracts/admin/analytics'
import { defineProcedure } from '@kobato/api/rpc/define-procedure'

export const analyticsContract = {
  counters: defineProcedure({ method: 'GET', path: '/analytics/counters' })
    .input(analyticsQuerySchema)
    .output(countersDto),
  views: defineProcedure({ method: 'GET', path: '/analytics/views' }).input(analyticsQuerySchema).output(viewsDto),
  heatmap: defineProcedure({ method: 'GET', path: '/analytics/heatmap' })
    .input(analyticsQuerySchema)
    .output(analyticsHeatmapOutputSchema),
  metrics: defineProcedure({ method: 'GET', path: '/analytics/metrics' })
    .input(analyticsMetricsInputSchema)
    .output(analyticsMetricsOutputSchema),
  export: defineProcedure({ method: 'GET', path: '/analytics/export' })
    .input(analyticsQuerySchema)
    .output(analyticsExportOutputSchema),
  overview: defineProcedure({ method: 'GET', path: '/analytics/overview' })
    .input(adminAnalyticsSearchInputSchema)
    .output(adminAnalyticsOverviewOutputSchema),
  mentions: defineProcedure({ method: 'GET', path: '/analytics/mentions' })
    .input(adminAnalyticsSearchInputSchema)
    .output(adminAnalyticsMentionsOutputSchema),
}
