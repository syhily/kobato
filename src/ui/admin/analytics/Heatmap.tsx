import { useMemo } from 'react'

import type { HeatmapCell } from '@/shared/contracts/analytics'

import { cn } from '@/ui/lib/cn'

// 7 × 24 weekday × hour heatmap. Pure CSS Grid + `color-mix()` for
// cell intensity — matches Sink's `Heatmap.vue` aesthetic without
// pulling in a chart library.

const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'] as const

export interface HeatmapProps {
  data: HeatmapCell[]
  className?: string
}

export function Heatmap({ data, className }: HeatmapProps) {
  const { grid, maxVisits } = useMemo(() => {
    const g = Array.from<number>({ length: 7 * 24 }).fill(0)
    let max = 0
    for (const cell of data) {
      if (cell.weekday < 0 || cell.weekday > 6 || cell.hour < 0 || cell.hour > 23) {
        continue
      }
      const idx = cell.weekday * 24 + cell.hour
      g[idx] = cell.visits
      if (cell.visits > max) {
        max = cell.visits
      }
    }
    return { grid: g, maxVisits: max }
  }, [data])

  if (maxVisits === 0) {
    return (
      <div className={cn('flex h-48 items-center justify-center text-sm text-muted-foreground', className)}>
        当前时间范围内暂无数据
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="grid grid-cols-[auto_1fr] gap-2">
        <div className="flex flex-col justify-around py-1 text-xs text-muted-foreground" aria-hidden>
          {WEEKDAY_LABELS.map((d) => (
            <div key={d} className="leading-none">
              {d}
            </div>
          ))}
        </div>
        <div
          className="grid grid-cols-[repeat(24,minmax(0,1fr))] gap-px"
          role="img"
          aria-label="7 天 24 小时访问热力图"
        >
          {grid.map((visits, idx) => {
            const intensity = visits === 0 ? 0 : Math.min(1, visits / maxVisits)
            const weekday = Math.floor(idx / 24)
            const hour = idx % 24
            return (
              <div
                // `idx` = weekday * 24 + hour — a stable bijection on a
                // fixed 7×24 grid; cells never reorder.
                // oxlint-disable-next-line react/no-array-index-key
                key={idx}
                title={`${WEEKDAY_LABELS[weekday]} ${hour}:00 — ${visits} 次访问`}
                className="aspect-square rounded-sm transition-transform hover:scale-110 hover:ring-1 hover:ring-foreground/30"
                style={{
                  background:
                    intensity === 0
                      ? 'var(--muted, #f4f4f5)'
                      : `color-mix(in srgb, var(--color-chart-1, #6366f1) ${Math.round(intensity * 100)}%, transparent)`,
                }}
              />
            )
          })}
        </div>
      </div>
      <div className="ml-7 flex items-center justify-between text-[10px] text-muted-foreground">
        <span>0:00</span>
        <span>6:00</span>
        <span>12:00</span>
        <span>18:00</span>
        <span>23:00</span>
      </div>
    </div>
  )
}
