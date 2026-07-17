import type { LoaderFunctionArgs } from 'react-router'

import type { CountersDto, HeatmapCell, MetricRow, MetricType, ViewsPoint } from '@/shared/contracts/analytics'
import type { AdminPostDto } from '@/shared/types/posts'

import { queryCounters } from '@/server/domains/analytics/services/counters'
import { queryHeatmap } from '@/server/domains/analytics/services/heatmap'
import { queryMetric } from '@/server/domains/analytics/services/metric'
import { parseAnalyticsSearch } from '@/server/domains/analytics/services/query-parser'
import { queryViews } from '@/server/domains/analytics/services/views'
import { getDbFromContext, getRouteRequestContext } from '@/server/domains/auth/context'
import { requireRole } from '@/server/domains/auth/rbac'
import { toAdminPostDto } from '@/server/domains/posts/projection'
import { findPostMetaById } from '@/server/domains/posts/repos/single'
import { findTagNamesByPostId } from '@/server/infra/db/operations/post-tag'
import { METRIC_GROUPS, METRIC_GROUP_TABS } from '@/shared/contracts/analytics'

export interface PostAnalyticsData {
  post: AdminPostDto
  counters: CountersDto
  views: ViewsPoint[]
  heatmap: HeatmapCell[]
  initialMetrics: Partial<Record<MetricType, MetricRow[]>>
}

// Single implementation behind both per-post analytics routes
// (/admin/posts/:postId/analytics and /editor/post/:id/analytics). The
// route modules only map their route param onto `postId`; new metric
// groups land here once.
export async function loadPostAnalyticsData({
  request,
  context,
  postId,
}: Pick<LoaderFunctionArgs, 'request' | 'context'> & { postId: bigint }): Promise<PostAnalyticsData> {
  const ctx = getRouteRequestContext({ request, context })
  requireRole(ctx, 'author')

  const db = getDbFromContext({ request, context })

  const meta = await findPostMetaById(db, postId)
  if (meta === null) {
    throw new Response('文章不存在', { status: 404 })
  }
  const tags = await findTagNamesByPostId(db, postId)
  const post = toAdminPostDto(meta, { tags })

  const url = new URL(request.url)
  const input = parseAnalyticsSearch(url.searchParams)

  const initialMetricTypes = METRIC_GROUPS.map((g) => METRIC_GROUP_TABS[g][0]!)

  const [counters, views, heatmap, ...metricRows] = await Promise.all([
    queryCounters(db, { ...input, entityType: 'post', entityId: postId }),
    queryViews(db, { ...input, entityType: 'post', entityId: postId }),
    queryHeatmap(db, { ...input, entityType: 'post', entityId: postId }),
    ...initialMetricTypes.map((t) => queryMetric(db, { ...input, entityType: 'post', entityId: postId }, t, 10)),
  ])

  const initialMetrics: Partial<Record<MetricType, MetricRow[]>> = {}
  initialMetricTypes.forEach((t, idx) => {
    initialMetrics[t] = metricRows[idx]!
  })

  return { post, counters, views, heatmap, initialMetrics }
}
