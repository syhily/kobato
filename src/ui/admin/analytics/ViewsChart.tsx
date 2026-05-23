import { useMemo, useState } from 'react'

import type { ViewsPoint } from '@/shared/contracts/analytics'

import { cn } from '@/ui/lib/cn'

// Inline SVG area + line chart for the dashboard. We could ship
// `@unovis/react` (Sink's choice) but a 100-line SVG is enough for
// this surface and saves ~80 KB of runtime. The exterior API matches
// Sink's Views.vue: an array of `{ time, visits, visitors }` points,
// area for visits, line for visitors, single Y-axis, gradient fill,
// hover crosshair + tooltip.

export interface ViewsChartProps {
  data: ViewsPoint[]
  className?: string
  height?: number
}

interface ChartGeometry {
  width: number
  height: number
  paddingX: number
  paddingTop: number
  paddingBottom: number
  innerWidth: number
  innerHeight: number
}

const DEFAULT_GEOMETRY: ChartGeometry = {
  width: 800,
  height: 220,
  paddingX: 36,
  paddingTop: 12,
  paddingBottom: 28,
  get innerWidth() {
    return this.width - this.paddingX * 2
  },
  get innerHeight() {
    return this.height - this.paddingTop - this.paddingBottom
  },
}

export function ViewsChart({ data, className, height = 220 }: ViewsChartProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const geometry = useMemo<ChartGeometry>(() => ({ ...DEFAULT_GEOMETRY, height }), [height])

  if (data.length === 0) {
    return (
      <div className={cn('flex h-56 items-center justify-center text-sm text-muted-foreground', className)}>
        当前时间范围内暂无数据
      </div>
    )
  }

  if (data.length === 1) {
    // Sink degrades to a grouped bar chart for a single bucket. We
    // do the same with a much simpler shape: render the values as
    // tall vertical bars under their labels.
    const only = data[0]!
    return (
      <div className={cn('flex h-56 items-end justify-center gap-12', className)}>
        <SingleBar label="访问量" value={only.visits} color="var(--color-chart-1, #6366f1)" />
        <SingleBar label="访客数" value={only.visitors} color="var(--color-chart-2, #14b8a6)" />
      </div>
    )
  }

  const xs = data.map((_, i) => geometry.paddingX + (i * geometry.innerWidth) / (data.length - 1))
  const maxValue = Math.max(...data.map((p) => Math.max(p.visits, p.visitors)), 1)
  const yScale = (v: number) => geometry.paddingTop + geometry.innerHeight - (v / maxValue) * geometry.innerHeight

  const areaPath = buildAreaPath(
    xs,
    data.map((p) => yScale(p.visits)),
    geometry,
  )
  const linePath = buildLinePath(
    xs,
    data.map((p) => yScale(p.visitors)),
  )
  const visitsLinePath = buildLinePath(
    xs,
    data.map((p) => yScale(p.visits)),
  )

  return (
    <div className={cn('relative', className)}>
      <svg
        viewBox={`0 0 ${geometry.width} ${geometry.height}`}
        width="100%"
        height={geometry.height}
        aria-label="访问量与访客数折线图"
        onMouseLeave={() => setHoverIndex(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          const x = ((e.clientX - rect.left) / rect.width) * geometry.width
          const idx = nearestIndex(xs, x)
          setHoverIndex(idx)
        }}
      >
        <defs>
          <linearGradient id="analytics-views-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-chart-1, #6366f1)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--color-chart-1, #6366f1)" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        <Gridlines geometry={geometry} maxValue={maxValue} />

        <path d={areaPath} fill="url(#analytics-views-fill)" />
        <path
          d={visitsLinePath}
          fill="none"
          stroke="var(--color-chart-1, #6366f1)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d={linePath}
          fill="none"
          stroke="var(--color-chart-2, #14b8a6)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {hoverIndex !== null && (
          <Crosshair
            x={xs[hoverIndex]!}
            geometry={geometry}
            visitsY={yScale(data[hoverIndex]!.visits)}
            visitorsY={yScale(data[hoverIndex]!.visitors)}
          />
        )}

        <AxisLabels geometry={geometry} data={data} hoverIndex={hoverIndex} />
      </svg>
      {hoverIndex !== null && data[hoverIndex] && (
        <Tooltip point={data[hoverIndex]!} x={xs[hoverIndex]!} width={geometry.width} />
      )}
      <Legend className="mt-2" />
    </div>
  )
}

function Gridlines({ geometry, maxValue }: { geometry: ChartGeometry; maxValue: number }) {
  const ticks = 4
  return (
    <g className="text-muted-foreground/30">
      {Array.from({ length: ticks + 1 }, (_, i) => {
        const y = geometry.paddingTop + (i * geometry.innerHeight) / ticks
        const value = Math.round((maxValue * (ticks - i)) / ticks)
        return (
          <g key={i}>
            <line x1={geometry.paddingX} x2={geometry.width - geometry.paddingX} y1={y} y2={y} stroke="currentColor" />
            <text
              x={geometry.paddingX - 8}
              y={y + 3}
              textAnchor="end"
              fontSize="10"
              fill="currentColor"
              className="text-muted-foreground"
            >
              {value}
            </text>
          </g>
        )
      })}
    </g>
  )
}

function Crosshair({
  x,
  geometry,
  visitsY,
  visitorsY,
}: {
  x: number
  geometry: ChartGeometry
  visitsY: number
  visitorsY: number
}) {
  return (
    <g>
      <line
        x1={x}
        x2={x}
        y1={geometry.paddingTop}
        y2={geometry.height - geometry.paddingBottom}
        stroke="currentColor"
        strokeDasharray="3 3"
        className="text-muted-foreground/60"
      />
      <circle cx={x} cy={visitsY} r="3" fill="var(--color-chart-1, #6366f1)" />
      <circle cx={x} cy={visitorsY} r="3" fill="var(--color-chart-2, #14b8a6)" />
    </g>
  )
}

function AxisLabels({
  geometry,
  data,
  hoverIndex,
}: {
  geometry: ChartGeometry
  data: ViewsPoint[]
  hoverIndex: number | null
}) {
  // Show ~5 evenly-spaced timestamps so the X axis never gets
  // crowded, regardless of how many buckets the API returned.
  const labelCount = Math.min(5, data.length)
  return (
    <g className="text-muted-foreground">
      {Array.from({ length: labelCount }, (_, i) => {
        const idx = Math.round((i * (data.length - 1)) / Math.max(1, labelCount - 1))
        if (hoverIndex !== null && Math.abs(idx - hoverIndex) <= 1) {
          return null
        }
        const x = geometry.paddingX + (idx * geometry.innerWidth) / Math.max(1, data.length - 1)
        const point = data[idx]
        if (!point) {
          return null
        }
        return (
          <text key={i} x={x} y={geometry.height - 10} textAnchor="middle" fontSize="10" fill="currentColor">
            {formatAxisLabel(point.time)}
          </text>
        )
      })}
    </g>
  )
}

function Tooltip({ point, x, width }: { point: ViewsPoint; x: number; width: number }) {
  // Bias the tooltip away from the right edge so it never clips off-screen.
  const ratio = x / width
  const align = ratio > 0.75 ? 'right' : ratio < 0.25 ? 'left' : 'center'
  return (
    <div
      className={cn(
        'pointer-events-none absolute top-3 z-10 min-w-[140px] rounded-md border bg-popover px-3 py-2 text-xs shadow-md',
        align === 'left' && 'left-12',
        align === 'right' && 'right-6',
        align === 'center' && 'left-1/2 -translate-x-1/2',
      )}
    >
      <div className="font-medium">{formatTooltipTime(point.time)}</div>
      <div className="mt-1 flex items-center gap-2">
        <span className="inline-block size-2 rounded-full" style={{ background: 'var(--color-chart-1, #6366f1)' }} />
        <span className="text-muted-foreground">访问量</span>
        <span className="ml-auto font-semibold">{point.visits}</span>
      </div>
      <div className="mt-0.5 flex items-center gap-2">
        <span className="inline-block size-2 rounded-full" style={{ background: 'var(--color-chart-2, #14b8a6)' }} />
        <span className="text-muted-foreground">访客数</span>
        <span className="ml-auto font-semibold">{point.visitors}</span>
      </div>
    </div>
  )
}

function Legend({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-4 text-xs text-muted-foreground', className)}>
      <span className="flex items-center gap-1.5">
        <span className="inline-block size-2 rounded-full" style={{ background: 'var(--color-chart-1, #6366f1)' }} />
        访问量
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block size-2 rounded-full" style={{ background: 'var(--color-chart-2, #14b8a6)' }} />
        访客数
      </span>
    </div>
  )
}

function SingleBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="text-3xl font-bold tabular-nums" style={{ color }}>
        {value}
      </div>
      <div className="h-32 w-12 rounded-md" style={{ background: color, opacity: 0.65 }} />
      <div className="text-sm text-muted-foreground">{label}</div>
    </div>
  )
}

// Helpers (kept private; exported equivalents not needed elsewhere).

function buildLinePath(xs: number[], ys: number[]): string {
  let d = ''
  for (let i = 0; i < xs.length; i += 1) {
    d += i === 0 ? `M ${xs[i]} ${ys[i]}` : ` L ${xs[i]} ${ys[i]}`
  }
  return d
}

function buildAreaPath(xs: number[], ys: number[], geometry: ChartGeometry): string {
  let d = `M ${xs[0]} ${geometry.height - geometry.paddingBottom}`
  for (let i = 0; i < xs.length; i += 1) {
    d += ` L ${xs[i]} ${ys[i]}`
  }
  d += ` L ${xs[xs.length - 1]} ${geometry.height - geometry.paddingBottom} Z`
  return d
}

function nearestIndex(xs: number[], target: number): number {
  let bestIdx = 0
  let bestDist = Infinity
  for (let i = 0; i < xs.length; i += 1) {
    const dist = Math.abs(xs[i]! - target)
    if (dist < bestDist) {
      bestDist = dist
      bestIdx = i
    }
  }
  return bestIdx
}

function formatAxisLabel(iso: string): string {
  const d = new Date(iso)
  // If the date is today, show HH:MM; otherwise show MM-DD.
  const now = new Date()
  if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()) {
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`
  }
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function formatTooltipTime(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}
