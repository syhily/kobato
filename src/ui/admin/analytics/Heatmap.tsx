import { useQuery } from '@tanstack/react-query'
import { useMemo, useRef, useState } from 'react'

import { orpcQuery } from '@/client/api/orpc-query'
import { useAnalyticsDashboardState } from '@/ui/admin/analytics/analytics-state-context'
import { AnalyticsQueryState } from '@/ui/admin/analytics/AnalyticsQueryState'
import { useAnalyticsQueryData } from '@/ui/admin/analytics/use-analytics-query'
import { buildAnalyticsInput, type AnalyticsScope, type HeatmapMetric } from '@/ui/admin/analytics/use-analytics-state'
import { Skeleton } from '@/ui/components/skeleton'
import { cn } from '@/ui/lib/cn'

// 7×24 weekday × hour heatmap (Slite's `analysis/Heatmap.vue`): CSS grid +
// color-mix intensity, isodow weekdays (Mon-first rows), a visits/visitors
// metric switch, and full keyboard navigation (arrow keys, roving tabindex,
// role="grid"). Self-fetching with clientTimezone — the loader's cells are
// bucketed in Etc/UTC, so the skeleton stays up until the client-timezone
// query resolves instead of flashing a grid whose hour columns then shift.

const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'] as const // isodow 1..7
const WEEKDAY_COUNT = 7
const HOURS = Array.from({ length: 24 }, (_, i) => i)

const METRIC_LABEL: Record<HeatmapMetric, string> = {
  visits: '访问量',
  visitors: '访客数',
}

export interface HeatmapProps {
  metric: HeatmapMetric
  className?: string
  scope?: AnalyticsScope
}

export function Heatmap({ metric, className, scope }: HeatmapProps) {
  const state = useAnalyticsDashboardState()
  const query = useQuery(
    orpcQuery.analytics.heatmap.queryOptions({
      input: buildAnalyticsInput(state, { scope }),
    }),
  )

  const { data: cells, hasLoaded, isError, refetching, isFetching, retry } = useAnalyticsQueryData(query)

  const [activeIndex, setActiveIndex] = useState(0)
  const cellRefs = useRef<(HTMLButtonElement | null)[]>([])

  const { values, maxValue, total, peak } = useMemo(() => {
    const v = Array.from<number>({ length: WEEKDAY_COUNT * 24 }).fill(0)
    let max = 0
    let sum = 0
    let peakCell: { weekday: number; hour: number; value: number } | null = null
    for (const cell of cells ?? []) {
      if (cell.weekday < 1 || cell.weekday > 7 || cell.hour < 0 || cell.hour > 23) {
        continue
      }
      const value = cell[metric]
      const idx = (cell.weekday - 1) * 24 + cell.hour
      v[idx] = value
      sum += value
      if (value > max) {
        max = value
        peakCell = { weekday: cell.weekday, hour: cell.hour, value }
      }
    }
    return { values: v, maxValue: max, total: sum, peak: peakCell }
  }, [cells, metric])

  const metricLabel = METRIC_LABEL[metric]
  const summary = `每周访问热力图。${metricLabel}总计 ${total.toLocaleString('zh-CN')}。${
    peak
      ? `峰值出现在周${WEEKDAY_LABELS[peak.weekday - 1]} ${peak.hour}:00,${metricLabel} ${peak.value.toLocaleString('zh-CN')}。`
      : ''
  }`

  const cellColor = (index: number): string => {
    const value = values[index]!
    if (value === 0 || maxValue === 0) {
      return 'color-mix(in srgb, var(--foreground) 5%, transparent)'
    }
    const alpha = Math.max(0.1, value / maxValue)
    const base = metric === 'visits' ? 'var(--color-chart-1)' : 'var(--color-chart-2)'
    return `color-mix(in srgb, ${base} ${Math.round(alpha * 100)}%, transparent)`
  }

  const handleCellKeydown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const row = Math.floor(index / 24)
    const column = index % 24
    let nextIndex: number
    switch (event.key) {
      case 'ArrowLeft':
        nextIndex = row * 24 + Math.max(0, column - 1)
        break
      case 'ArrowRight':
        nextIndex = row * 24 + Math.min(23, column + 1)
        break
      case 'ArrowUp':
        nextIndex = Math.max(0, row - 1) * 24 + column
        break
      case 'ArrowDown':
        nextIndex = Math.min(WEEKDAY_COUNT - 1, row + 1) * 24 + column
        break
      default:
        return
    }
    event.preventDefault()
    setActiveIndex(nextIndex)
    cellRefs.current[nextIndex]?.focus()
  }

  return (
    <AnalyticsQueryState
      isError={isError}
      onRetry={retry}
      isLoading={!hasLoaded}
      isEmpty={cells !== null && cells.length === 0}
      skeleton={<HeatmapSkeleton className={className} />}
      className={cn('aspect-4/1 justify-center', className)}
    >
      <div
        className={cn(
          'aspect-4/1 w-full overflow-x-auto rounded-sm transition-opacity duration-500 ease-out motion-reduce:transition-none',
          refetching ? 'opacity-60' : 'opacity-100',
          className,
        )}
      >
        <div className="flex h-full min-w-[600px] flex-col">
          <div
            className="mb-2 ml-12 grid flex-none grid-cols-[repeat(24,minmax(0,1fr))] gap-2 text-[10px] text-muted-foreground"
            aria-hidden
          >
            {HOURS.map((hour) => (
              <div key={hour} className="text-center">
                {hour}
              </div>
            ))}
          </div>

          <div
            className="flex flex-1 flex-col gap-3"
            role="grid"
            aria-busy={isFetching}
            aria-label={summary}
            aria-rowcount={WEEKDAY_COUNT}
            aria-colcount={24}
          >
            {WEEKDAY_LABELS.map((weekdayLabel, rowIndex) => (
              <div key={weekdayLabel} className="flex flex-1 items-center gap-3" role="row">
                <div className="w-9 shrink-0 text-right text-[10px] text-muted-foreground" role="rowheader">
                  {weekdayLabel}
                </div>
                <div className="grid h-full flex-1 grid-cols-[repeat(24,minmax(0,1fr))] gap-2">
                  {HOURS.map((hour) => {
                    const index = rowIndex * 24 + hour
                    const value = values[index]!
                    return (
                      <div key={hour} className="size-full" role="gridcell">
                        <button
                          ref={(element) => {
                            cellRefs.current[index] = element
                          }}
                          type="button"
                          className="relative block size-full rounded-sm border-0 p-0 transition-[background-color,box-shadow] duration-300 hover:ring-1 hover:ring-foreground/10 focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none motion-reduce:transition-none"
                          style={{ backgroundColor: cellColor(index) }}
                          tabIndex={activeIndex === index ? 0 : -1}
                          aria-label={`周${weekdayLabel} ${hour}:00。${metricLabel}: ${value.toLocaleString('zh-CN')}。`}
                          title={`周${weekdayLabel} ${hour}:00 — ${metricLabel} ${value.toLocaleString('zh-CN')}`}
                          onFocus={() => setActiveIndex(index)}
                          onKeyDown={(event) => handleCellKeydown(event, index)}
                        />
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AnalyticsQueryState>
  )
}

function HeatmapSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('aspect-4/1 w-full overflow-x-auto rounded-sm', className)} role="status" aria-busy="true">
      <span className="sr-only">加载中</span>
      <div aria-hidden className="flex h-full min-w-[600px] flex-col">
        <div className="mb-2 ml-12 grid flex-none grid-cols-[repeat(12,minmax(0,1fr))] gap-2">
          {HOURS.slice(0, 12).map((hour) => (
            <Skeleton key={hour} className="h-1.5 w-full rounded-sm" />
          ))}
        </div>
        <div className="flex flex-1 flex-col gap-3">
          {WEEKDAY_LABELS.map((weekday) => (
            <div key={weekday} className="flex flex-1 items-center gap-3">
              <Skeleton className="h-2 w-9 shrink-0 rounded-sm" />
              <Skeleton className="h-full flex-1 rounded-sm" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
