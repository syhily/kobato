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
} from '@kobato/contracts/analytics.ts'
import { oc } from '@orpc/contract'

// The analytics RPC contract — the dashboard's DuckDB read surface.
export const analyticsContract = {
  counters: oc.route({ method: 'GET', path: '/analytics/counters' }).input(analyticsQuerySchema).output(countersDto),
  views: oc.route({ method: 'GET', path: '/analytics/views' }).input(analyticsQuerySchema).output(viewsDto),
  heatmap: oc
    .route({ method: 'GET', path: '/analytics/heatmap' })
    .input(analyticsQuerySchema)
    .output(analyticsHeatmapOutputSchema),
  metrics: oc
    .route({ method: 'GET', path: '/analytics/metrics' })
    .input(analyticsMetricsInputSchema)
    .output(analyticsMetricsOutputSchema),
  export: oc
    .route({ method: 'GET', path: '/analytics/export' })
    .input(analyticsQuerySchema)
    .output(analyticsExportOutputSchema),
  overview: oc
    .route({ method: 'GET', path: '/analytics/overview' })
    .input(adminAnalyticsSearchInputSchema)
    .output(adminAnalyticsOverviewOutputSchema),
  mentions: oc
    .route({ method: 'GET', path: '/analytics/mentions' })
    .input(adminAnalyticsSearchInputSchema)
    .output(adminAnalyticsMentionsOutputSchema),
}
