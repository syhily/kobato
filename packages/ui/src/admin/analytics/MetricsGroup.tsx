import type { MetricGroup, MetricRow, MetricType } from '@kobato/shared/contracts/analytics'

import { METRIC_GROUP_TABS } from '@kobato/shared/contracts/analytics'
import { useState } from 'react'

function isMetricType(value: string): value is MetricType {
  return (
    value === 'country' ||
    value === 'region' ||
    value === 'city' ||
    value === 'referer' ||
    value === 'language' ||
    value === 'timezone' ||
    value === 'os' ||
    value === 'browser' ||
    value === 'browserType' ||
    value === 'device' ||
    value === 'deviceType' ||
    value === 'path'
  )
}
import { MetricList } from '@kobato/ui/admin/analytics/MetricList'
import { Card, CardContent, CardHeader, CardTitle } from '@kobato/ui/components/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@kobato/ui/components/tabs'
import { cn } from '@kobato/ui/lib/cn'

const GROUP_LABEL: Record<MetricGroup, string> = {
  location: '位置',
  referer: '来源',
  time: '语言与时区',
  device: '设备',
  browser: '浏览器与系统',
}

const TYPE_LABEL: Record<MetricType, string> = {
  country: '国家',
  region: '地区',
  city: '城市',
  referer: 'Referer',
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
  entityType?: 'post' | 'page'
  entityId?: string
}

export function MetricsGroup({ group, initial, className, entityType, entityId }: MetricsGroupProps) {
  const tabs = METRIC_GROUP_TABS[group]
  const [active, setActive] = useState<MetricType>(tabs[0]!)

  return (
    <Card className={cn('gap-2 shadow-none', className)}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-foreground">{GROUP_LABEL[group]}</CardTitle>
          <Tabs
            value={active}
            onValueChange={(v: string) => {
              if (isMetricType(v)) {
                setActive(v)
              }
            }}
          >
            <TabsList className="h-7">
              {tabs.map((t) => (
                <TabsTrigger key={t} value={t} className="px-2 py-1 text-xs">
                  {TYPE_LABEL[t]}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>
      <CardContent className="px-3 pb-4">
        <Tabs value={active}>
          {tabs.map((t) => (
            <TabsContent key={t} value={t} className="mt-0">
              <MetricList type={t} initial={initial?.[t]} entityType={entityType} entityId={entityId} />
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  )
}
