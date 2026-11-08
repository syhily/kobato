import type { MetricGroup, MetricRow, MetricType } from '@/shared/contracts/analytics'

import { METRIC_GROUP_TABS } from '@/shared/contracts/analytics'
import { METRIC_TYPE_LABEL_IDS } from '@/ui/admin/analytics/metric-labels'
import { MetricList } from '@/ui/admin/analytics/MetricList'
import { type AnalyticsScope } from '@/ui/admin/analytics/use-analytics-state'
import { Card } from '@/ui/components/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/components/tabs'
import { cn } from '@/ui/lib/cn'
import { useI18n } from '@/ui/lib/I18nProvider'

// Tabbed metric card per Slite's `metrics/Group.vue` — one tab per
// dimension of the group, each fetching its own top-N list.

export interface MetricsGroupProps {
  group: MetricGroup
  initial?: Partial<Record<MetricType, MetricRow[]>>
  className?: string
  scope?: AnalyticsScope
}

export function MetricsGroup({ group, initial, className, scope }: MetricsGroupProps) {
  const { t } = useI18n()
  const tabs = METRIC_GROUP_TABS[group]

  return (
    <Card className={cn('flex flex-col gap-0 overflow-hidden py-0 shadow-none lg:h-[500px]', className)}>
      <Tabs defaultValue={tabs[0]} className="flex min-h-0 flex-1 flex-col gap-0">
        <div className="max-w-full shrink-0 overflow-x-auto border-b p-2">
          <TabsList className="h-8 min-w-max">
            {tabs.map((metricType) => (
              <TabsTrigger key={metricType} value={metricType} className="px-3 py-1 text-xs">
                {t(METRIC_TYPE_LABEL_IDS[metricType])}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        {tabs.map((metricType) => (
          <TabsContent key={metricType} value={metricType} className="mt-0 flex min-h-0 flex-1 flex-col">
            <MetricList
              type={metricType}
              title={t(METRIC_TYPE_LABEL_IDS[metricType])}
              initial={initial?.[metricType]}
              scope={scope}
              className="flex-1"
            />
          </TabsContent>
        ))}
      </Tabs>
    </Card>
  )
}
