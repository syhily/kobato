import { ArrowRightIcon, EyeIcon, GlobeIcon, TrendingUpIcon, UsersIcon } from 'lucide-react'
import { Link } from 'react-router'

import type { CountersDto, ViewsPoint } from '@/shared/contracts/analytics'

import { Button } from '@/ui/components/button'

interface VisitSummaryCardProps {
  summary: CountersDto
  weeklyTrend?: ViewsPoint[] | null
}

interface KpiEntry {
  label: string
  value: number
  icon: typeof EyeIcon
}

const KPI_ENTRIES: KpiEntry[] = [
  { label: '访问量', value: 0, icon: EyeIcon },
  { label: '访客数', value: 0, icon: UsersIcon },
  { label: '来源域名', value: 0, icon: GlobeIcon },
]

export function VisitSummaryCard({ summary, weeklyTrend }: VisitSummaryCardProps) {
  const values = [summary.visits, summary.visitors, summary.referers]
  const daily = weeklyTrend ? aggregateToDaily(weeklyTrend) : []

  return (
    <div className="flex h-full flex-col rounded-xl border bg-card p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-medium">今日概览</h2>
        <Button type="button" variant="ghost" size="sm" render={<Link to="/admin/analytics?preset=today" />}>
          <span className="hidden sm:inline">查看详情</span> <ArrowRightIcon data-icon />
        </Button>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">最近 24 小时访问统计</p>

      <ul className="mt-6 flex flex-1 flex-col justify-center gap-5">
        {KPI_ENTRIES.map((entry, i) => {
          const Icon = entry.icon
          return (
            <li key={entry.label} className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-status-info-bg">
                <Icon aria-hidden="true" className="size-5 text-status-info-fg" strokeWidth={1.8} />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{entry.label}</p>
                <p className="text-xl font-semibold tabular-nums">{values[i]?.toLocaleString() ?? 0}</p>
              </div>
            </li>
          )
        })}
      </ul>

      {daily.length > 0 && (
        <div className="mt-5 border-t pt-4">
          <div className="flex items-center gap-2">
            <TrendingUpIcon className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium">最近 7 天趋势</span>
          </div>
          <div className="mt-3 flex items-end gap-4">
            <TrendSparkline points={daily} />
            <div className="mb-1 flex flex-col gap-0.5 text-right">
              <span className="text-2xl font-semibold tabular-nums">{daily.reduce((s, d) => s + d.visits, 0)}</span>
              <span className="text-xs text-muted-foreground">总访问</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function TrendSparkline({ points }: { points: { visits: number }[] }) {
  const maxVisits = Math.max(1, ...points.map((d) => d.visits))
  const width = 320
  const height = 64
  const padding = 4
  const chartW = width - padding * 2
  const chartH = height - padding * 2
  const stepX = points.length > 1 ? chartW / (points.length - 1) : chartW

  const pathPoints = points.map((d, i) => {
    const x = padding + i * stepX
    const y = padding + chartH - (d.visits / maxVisits) * chartH
    return `${x},${y}`
  })

  const areaPath =
    pathPoints.length > 0
      ? `M${pathPoints[0]} L${pathPoints.slice(1).join(' L')} L${padding + chartW},${padding + chartH} L${padding},${padding + chartH} Z`
      : ''

  const linePath = pathPoints.length > 0 ? `M${pathPoints.join(' L')}` : ''

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-16 w-full max-w-xs" preserveAspectRatio="none">
      <defs>
        <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.25" />
          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
        </linearGradient>
      </defs>
      {areaPath && <path d={areaPath} fill="url(#trendGradient)" />}
      {linePath && (
        <path
          d={linePath}
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  )
}

function aggregateToDaily(points: ViewsPoint[]): { date: string; visits: number; visitors: number }[] {
  const map = new Map<string, { visits: number; visitors: number }>()
  for (const p of points) {
    const date = p.time.slice(0, 10)
    const existing = map.get(date) ?? { visits: 0, visitors: 0 }
    existing.visits += p.visits
    existing.visitors += p.visitors
    map.set(date, existing)
  }
  return Array.from(map.entries())
    .map(([date, vals]) => ({ date, ...vals }))
    .sort((a, b) => a.date.localeCompare(b.date))
}
