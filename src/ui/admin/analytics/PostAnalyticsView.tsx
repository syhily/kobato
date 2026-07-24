import { useState } from 'react'
import { Link } from 'react-router'

import type {
  CountersDto,
  HeatmapCell,
  MetricGroup,
  MetricRow,
  MetricType,
  ViewsPoint,
} from '@/shared/contracts/analytics'
import type { AdminPostDto } from '@/shared/contracts/posts'

import { METRIC_GROUPS } from '@/shared/contracts/analytics'
import { Counters } from '@/ui/admin/analytics/Counters'
import { DateRangePicker } from '@/ui/admin/analytics/DateRangePicker'
import { FiltersBar } from '@/ui/admin/analytics/Filters'
import { Heatmap } from '@/ui/admin/analytics/Heatmap'
import { MetricsGroup } from '@/ui/admin/analytics/MetricsGroup'
import { useAnalyticsState } from '@/ui/admin/analytics/use-analytics-state'
import { ViewsChart } from '@/ui/admin/analytics/ViewsChart'
import { Card, CardContent } from '@/ui/components/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/components/tabs'

export interface PostAnalyticsViewProps {
  post: AdminPostDto
  counters: CountersDto
  views: ViewsPoint[]
  heatmap: HeatmapCell[]
  initialMetrics: Partial<Record<MetricType, MetricRow[]>>
}

function isChartTab(value: string): value is 'views' | 'heatmap' {
  return value === 'views' || value === 'heatmap'
}

// Title + public-link header shared by both shells. Each route wraps it
// in its own chrome (admin: bare column; editor: back link + tab strip).
export function PostAnalyticsHeader({ post }: { post: AdminPostDto }) {
  return (
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
  )
}

export function PostAnalyticsView({ post, counters, views, heatmap, initialMetrics }: PostAnalyticsViewProps) {
  const state = useAnalyticsState()
  const [chartTab, setChartTab] = useState<'views' | 'heatmap'>('views')

  return (
    <>
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
    </>
  )
}
