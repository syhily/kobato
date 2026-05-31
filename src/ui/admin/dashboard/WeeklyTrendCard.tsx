import { TrendingUpIcon } from 'lucide-react'

interface TrendPoint {
  time: string
  visits: number
  visitors: number
}

export function WeeklyTrendCard({ points }: { points: TrendPoint[] }) {
  // Aggregate hourly points into daily buckets for a 7-day sparkline.
  const daily = aggregateToDaily(points)
  const maxVisits = Math.max(1, ...daily.map((d) => d.visits))
  const width = 320
  const height = 64
  const padding = 4
  const chartW = width - padding * 2
  const chartH = height - padding * 2
  const stepX = daily.length > 1 ? chartW / (daily.length - 1) : chartW

  const pathPoints = daily.map((d, i) => {
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
    <div className="rounded-xl border bg-card p-6">
      <div className="flex items-center gap-2">
        <TrendingUpIcon className="size-4 text-muted-foreground" />
        <h2 className="text-base font-medium">最近 7 天访问趋势</h2>
      </div>
      <div className="mt-4 flex items-end gap-4">
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
        <div className="mb-1 flex flex-col gap-0.5 text-right">
          <span className="text-2xl font-semibold tabular-nums">{daily.reduce((s, d) => s + d.visits, 0)}</span>
          <span className="text-xs text-muted-foreground">总访问</span>
        </div>
      </div>
    </div>
  )
}

function aggregateToDaily(points: TrendPoint[]): { date: string; visits: number; visitors: number }[] {
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
