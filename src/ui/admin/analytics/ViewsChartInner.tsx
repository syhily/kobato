import { VisArea, VisAxis, VisCrosshair, VisGroupedBar, VisLine, VisTooltip, VisXYContainer } from '@unovis/react'
import { useId, useMemo } from 'react'

import type { TimeUnit, ViewsPoint } from '@/shared/contracts/analytics'

import { escapeHtml } from '@/shared/utils/security'
import { formatTimeLabel, parseTimeLabel } from '@/ui/admin/analytics/time-labels'
import { cn } from '@/ui/lib/cn'

// The @unovis chart body — CLIENT ONLY. This module is lazy-loaded behind
// the hydration gate in `ViewsChart.tsx`; never import it statically from an
// SSR-rendered module.

interface ChartDatum {
  x: number
  label: string
  visits: number
  visitors: number
}

const COLOR_VISITS = 'var(--color-chart-1)'
const COLOR_VISITORS = 'var(--color-chart-2)'

export interface ViewsChartInnerProps {
  points: ViewsPoint[]
  unit: TimeUnit
  className?: string
}

export function ViewsChartInner({ points, unit, className }: ViewsChartInnerProps) {
  const summaryId = `trend-summary-${useId()}`
  const data = useMemo<ChartDatum[]>(
    () =>
      points
        .map((point) => ({
          x: parseTimeLabel(unit, point.time),
          label: point.time,
          visits: point.visits,
          visitors: point.visitors,
        }))
        .filter((d) => Number.isFinite(d.x)),
    [points, unit],
  )

  // Area/line for a multi-point series; grouped bars for a lone bucket or
  // the minute unit (dense 1-minute buckets read as bars, per the plan).
  const isAreaMode = data.length > 1 && unit !== 'minute'

  const totalVisits = data.reduce((sum, d) => sum + d.visits, 0)
  const totalVisitors = data.reduce((sum, d) => sum + d.visitors, 0)
  const peak = data.reduce<ChartDatum | undefined>(
    (current, d) => (!current || d.visits > current.visits ? d : current),
    undefined,
  )

  const summary = peak
    ? `访问趋势: 总访问量 ${totalVisits.toLocaleString('zh-CN')}, 总访客数 ${totalVisitors.toLocaleString('zh-CN')}。峰值出现在 ${formatTimeLabel(unit, peak.label)}, 访问量 ${peak.visits.toLocaleString('zh-CN')}。`
    : '当前时间范围内暂无数据'

  const x = (d: ChartDatum) => d.x
  const yVisits = (d: ChartDatum) => d.visits
  const yVisitors = (d: ChartDatum) => d.visitors

  // The tooltip template is raw HTML — escape every interpolated value.
  const tooltipTemplate = (d: ChartDatum) => `
    <div class="min-w-[150px] rounded-xl border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <div class="font-medium">${escapeHtml(formatTimeLabel(unit, d.label))}</div>
      <div class="mt-1 flex items-center gap-2">
        <span class="inline-block size-2 rounded-full" style="background: ${COLOR_VISITS}"></span>
        <span class="text-muted-foreground">访问量</span>
        <span class="ml-auto pl-3 font-semibold tabular-nums">${escapeHtml(d.visits.toLocaleString('zh-CN'))}</span>
      </div>
      <div class="mt-0.5 flex items-center gap-2">
        <span class="inline-block size-2 rounded-full" style="background: ${COLOR_VISITORS}"></span>
        <span class="text-muted-foreground">访客数</span>
        <span class="ml-auto pl-3 font-semibold tabular-nums">${escapeHtml(d.visitors.toLocaleString('zh-CN'))}</span>
      </div>
    </div>`

  return (
    <div
      className={cn('aspect-4/1 w-full', className)}
      role="img"
      aria-label="访问量与访客数趋势图"
      aria-describedby={summaryId}
    >
      <VisXYContainer data={data} margin={{ left: 0, right: 0 }}>
        {isAreaMode ? (
          <>
            <VisArea x={x} y={yVisits} color={COLOR_VISITS} opacity={0.4} />
            <VisLine x={x} y={yVisits} color={COLOR_VISITS} lineWidth={2} />
            <VisArea x={x} y={yVisitors} color={COLOR_VISITORS} opacity={0.4} />
            <VisLine x={x} y={yVisitors} color={COLOR_VISITORS} lineWidth={2} />
          </>
        ) : (
          <VisGroupedBar
            x={x}
            y={[yVisits, yVisitors]}
            color={[COLOR_VISITS, COLOR_VISITORS]}
            roundedCorners={4}
            groupWidth={unit === 'minute' ? 8 : undefined}
          />
        )}
        <VisAxis
          type="y"
          tickFormat={(value) => Number(value).toLocaleString('zh-CN')}
          tickLine={false}
          domainLine={false}
          gridLine={true}
          numTicks={3}
        />
        <VisTooltip />
        <VisCrosshair x={x} template={tooltipTemplate} color={[COLOR_VISITS, COLOR_VISITORS]} />
      </VisXYContainer>
      <p id={summaryId} className="sr-only">
        {summary}
      </p>
    </div>
  )
}
