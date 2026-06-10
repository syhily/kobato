import { useState } from 'react'
import { Link, useLoaderData } from 'react-router'

function isChartTab(value: string): value is 'views' | 'heatmap' {
  return value === 'views' || value === 'heatmap'
}

import type { MetricGroup, MetricRow, MetricType } from '@/shared/contracts/analytics'

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
import { Counters } from '@/ui/admin/analytics/Counters'
import { DateRangePicker } from '@/ui/admin/analytics/DateRangePicker'
import { FiltersBar } from '@/ui/admin/analytics/Filters'
import { Heatmap } from '@/ui/admin/analytics/Heatmap'
import { MetricsGroup } from '@/ui/admin/analytics/MetricsGroup'
import { useAnalyticsState } from '@/ui/admin/analytics/use-analytics-state'
import { ViewsChart } from '@/ui/admin/analytics/ViewsChart'
import { Card, CardContent } from '@/ui/components/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/components/tabs'

import type { Route } from './+types/analytics'

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const ctx = getRouteRequestContext({ request, context })
  requireRole(ctx, 'author')

  const db = getDbFromContext({ request, context })

  const postId = BigInt(params.postId)
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

export default function PostAnalyticsPage() {
  const { post, counters, views, heatmap, initialMetrics } = useLoaderData<typeof loader>()
  const state = useAnalyticsState()
  const [chartTab, setChartTab] = useState<'views' | 'heatmap'>('views')

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold">文章分析</h1>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{post.title}</span>
          <span className="text-border">·</span>
          <Link to={`/posts/${post.slug}`} target="_blank" className="hover:underline">
            /posts/{post.slug}
          </Link>
        </div>
      </div>

      <Card className="px-4 py-3">
        <div className="flex flex-col gap-3">
          <DateRangePicker preset={state.preset} onSelect={state.setPreset} />
          <FiltersBar filters={state.filters} onClear={state.clearFilter} onClearAll={state.clearAllFilters} />
        </div>
      </Card>

      <Counters data={counters} />

      <Card className="gap-2">
        <CardContent className="flex flex-col gap-3 px-4 pb-4">
          <Tabs
            value={chartTab}
            onValueChange={(v) => {
              if (typeof v === 'string' && isChartTab(v)) {
                setChartTab(v)
              }
            }}
          >
            <TabsList className="h-8">
              <TabsTrigger value="views">趋势</TabsTrigger>
              <TabsTrigger value="heatmap">热力</TabsTrigger>
            </TabsList>
            <TabsContent value="views" className="mt-3">
              <ViewsChart data={views} />
            </TabsContent>
            <TabsContent value="heatmap" className="mt-3">
              <Heatmap data={heatmap} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {METRIC_GROUPS.map((g: MetricGroup) => (
          <MetricsGroup key={g} group={g} initial={initialMetrics} entityType="post" entityId={post.id} />
        ))}
      </div>
    </div>
  )
}
