import { Card, CardContent } from '../../components/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/tabs'
import { useI18n } from '../../lib/I18nProvider'
import { useAnalyticsDashboardState } from './analytics-state-context'
import { Heatmap } from './Heatmap'
import { HEATMAP_METRIC_LABEL_IDS } from './metric-labels'
import { type AnalyticsScope, type HeatmapMetric } from './use-analytics-state'
import { ViewsChart } from './ViewsChart'

const METRIC_OPTIONS: readonly HeatmapMetric[] = ['visits', 'visitors']

export interface TrendTabsProps {
  scope?: AnalyticsScope
}

export function TrendTabs({ scope }: TrendTabsProps) {
  const { t } = useI18n()
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
              <TabsTrigger value="trend">{t('admin.analytics.tabs.trend')}</TabsTrigger>
              <TabsTrigger value="heatmap">{t('admin.analytics.tabs.heatmap')}</TabsTrigger>
            </TabsList>
            {state.viewMode === 'heatmap' && (
              <Select
                items={METRIC_OPTIONS.map((value) => ({ value, label: t(HEATMAP_METRIC_LABEL_IDS[value]) }))}
                value={state.heatmapMetric}
                onValueChange={(value: string | null) => {
                  if (value === 'visits' || value === 'visitors') {
                    state.setHeatmapMetric(value)
                  }
                }}
              >
                <SelectTrigger className="h-8 w-[120px]" aria-label={t('admin.analytics.tabs.metricAria')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METRIC_OPTIONS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {t(HEATMAP_METRIC_LABEL_IDS[value])}
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
