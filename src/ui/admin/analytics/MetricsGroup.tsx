import type { MetricGroup, MetricRow, MetricType } from '@/shared/contracts/analytics'

import { METRIC_GROUP_TABS } from '@/shared/contracts/analytics'
import { MetricList } from '@/ui/admin/analytics/MetricList'
import { type AnalyticsScope } from '@/ui/admin/analytics/use-analytics-state'
import { Card } from '@/ui/components/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/components/tabs'
import { cn } from '@/ui/lib/cn'

// Tabbed metric card per Slite's `metrics/Group.vue` — one tab per
// dimension of the group, each fetching its own top-N list.

export const METRIC_TYPE_LABEL: Record<MetricType, string> = {
  country: '国家',
  region: '地区',
  city: '城市',
  referer: '来源',
  language: '语言',
  timezone: '时区',
  os: '操作系统',
  browser: '浏览器',
  browserType: '浏览器类型',
  device: '设备',
  deviceType: '设备类型',
  path: '路径',
}

export interface MetricsGroupProps {
  group: MetricGroup
  initial?: Partial<Record<MetricType, MetricRow[]>>
  className?: string
  scope?: AnalyticsScope
}

export function MetricsGroup({ group, initial, className, scope }: MetricsGroupProps) {
  const tabs = METRIC_GROUP_TABS[group]

  return (
    <Card className={cn('flex flex-col gap-0 overflow-hidden py-0 shadow-none lg:h-[500px]', className)}>
      <Tabs defaultValue={tabs[0]} className="flex min-h-0 flex-1 flex-col gap-0">
        <div className="max-w-full shrink-0 overflow-x-auto border-b p-2">
          <TabsList className="h-8 min-w-max">
            {tabs.map((t) => (
              <TabsTrigger key={t} value={t} className="px-3 py-1 text-xs">
                {METRIC_TYPE_LABEL[t]}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        {tabs.map((t) => (
          <TabsContent key={t} value={t} className="mt-0 flex min-h-0 flex-1 flex-col">
            <MetricList type={t} title={METRIC_TYPE_LABEL[t]} initial={initial?.[t]} scope={scope} className="flex-1" />
          </TabsContent>
        ))}
      </Tabs>
    </Card>
  )
}
