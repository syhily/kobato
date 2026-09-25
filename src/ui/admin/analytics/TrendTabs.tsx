import { useAnalyticsDashboardState } from '@/ui/admin/analytics/analytics-state-context'
import { Heatmap } from '@/ui/admin/analytics/Heatmap'
import { type AnalyticsScope, type HeatmapMetric } from '@/ui/admin/analytics/use-analytics-state'
import { ViewsChart } from '@/ui/admin/analytics/ViewsChart'
import { Card, CardContent } from '@/ui/components/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/components/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/components/tabs'

// 趋势 | 每周趋势 tabs (Slite's `analysis/Index.vue`): the view switch is
// URL-synced (?view=), and the heatmap tab exposes a visits/visitors Select
// (?metric=) next to the tab list.

const METRIC_OPTIONS: { value: HeatmapMetric; label: string }[] = [
  { value: 'visits', label: '访问量' },
  { value: 'visitors', label: '访客数' },
]

export interface TrendTabsProps {
  scope?: AnalyticsScope
}

export function TrendTabs({ scope }: TrendTabsProps) {
  const state = useAnalyticsDashboardState()

  return (
    <Card className="gap-2 shadow-none">
      <CardContent className="flex flex-col gap-3 px-4 pb-4">
        <Tabs
          value={state.viewMode}
          onValueChange={(value: string) => {
            if (value === 'trend' || value === 'heatmap') {
              state.setViewMode(value)
            }
          }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <TabsList className="h-8">
              <TabsTrigger value="trend">趋势</TabsTrigger>
              <TabsTrigger value="heatmap">每周趋势</TabsTrigger>
            </TabsList>
            {state.viewMode === 'heatmap' && (
              <Select
                items={METRIC_OPTIONS}
                value={state.heatmapMetric}
                onValueChange={(value: string | null) => {
                  if (value === 'visits' || value === 'visitors') {
                    state.setHeatmapMetric(value)
                  }
                }}
              >
                <SelectTrigger className="h-8 w-[120px]" aria-label={`每周趋势: 访问量 / 访客数`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METRIC_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <TabsContent value="trend" className="mt-3">
            {state.viewMode === 'trend' && <ViewsChart scope={scope} />}
          </TabsContent>
          <TabsContent value="heatmap" className="mt-3">
            {state.viewMode === 'heatmap' && <Heatmap metric={state.heatmapMetric} scope={scope} />}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
