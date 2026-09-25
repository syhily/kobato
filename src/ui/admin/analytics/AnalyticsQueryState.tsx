import type { ReactNode } from 'react'

import { Button } from '@/ui/components/button'
import { cn } from '@/ui/lib/cn'

// Shared query-state chrome for the self-fetching analytics panels
// (Counters, ViewsChart, Heatmap, MetricList, LocationsMap): the error
// alert with retry, the per-panel skeleton slot, and the empty-range
// state, in one fixed precedence — error → loading → empty → content.
// `className` sizes/positions the error and empty containers per panel;
// `skeleton` stays panel-owned because each placeholder mimics its own
// content geometry.

export interface AnalyticsQueryStateProps {
  isError: boolean
  onRetry: () => void
  isLoading: boolean
  isEmpty: boolean
  skeleton: ReactNode
  className?: string
  children: ReactNode
}

export function AnalyticsQueryState({
  isError,
  onRetry,
  isLoading,
  isEmpty,
  skeleton,
  className,
  children,
}: AnalyticsQueryStateProps) {
  if (isError) {
    return (
      <div className={cn('flex items-center gap-2 text-sm text-destructive', className)} role="alert">
        <span>统计数据加载失败</span>
        <Button type="button" variant="link" size="sm" className="text-destructive" onClick={onRetry}>
          重试
        </Button>
      </div>
    )
  }

  if (isLoading) {
    return <>{skeleton}</>
  }

  if (isEmpty) {
    return (
      <div className={cn('flex items-center justify-center text-sm text-muted-foreground', className)} role="status">
        当前时间范围内暂无数据
      </div>
    )
  }

  return <>{children}</>
}
