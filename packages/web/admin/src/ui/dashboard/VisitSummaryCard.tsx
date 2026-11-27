import type { CountersDto, ViewsDto, ViewsPoint } from '@kobato/api/contracts/admin/analytics'
import type { UiMessageId } from '@kobato/i18n/messages/ui/en-US'

import { orpcQuery } from '@kobato/api/browser/orpc-query'
import { Button } from '@kobato/ui/components/button'
import { Skeleton } from '@kobato/ui/components/skeleton'
import { useI18n } from '@kobato/ui/lib/I18nProvider'
import { useHydrated } from '@kobato/ui/lib/use-hydrated'
import { formatNumber } from '@kobato/utils/format'
import { dayKeyOfLabel } from '@kobato/web-admin/ui/analytics/time-labels'
import { getClientTimezone } from '@kobato/web-admin/ui/analytics/use-analytics-state'
import { useQuery } from '@tanstack/react-query'
import { ArrowRightIcon, EyeIcon, GlobeIcon, TrendingUpIcon, UsersIcon } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router'

interface VisitSummaryCardProps {
  summary: CountersDto
  weeklyTrend?: ViewsDto | null
}

interface KpiEntry {
  labelId: UiMessageId
  value: number
  icon: typeof EyeIcon
}

const KPI_ENTRIES: KpiEntry[] = [
  { labelId: 'admin.welcome.visit.kpi.visits', value: 0, icon: EyeIcon },
  { labelId: 'admin.welcome.visit.kpi.visitors', value: 0, icon: UsersIcon },
  { labelId: 'admin.welcome.visit.kpi.referers', value: 0, icon: GlobeIcon },
]

export function VisitSummaryCard({ summary, weeklyTrend }: VisitSummaryCardProps) {
  const { locale, t } = useI18n()
  const values = [summary.visits, summary.visitors, summary.referers]
  const trendQuery = useQuery(
    orpcQuery.admin.analytics.views.queryOptions({
      input: { preset: 'last-7d', unit: 'day', clientTimezone: getClientTimezone() },
    }),
  )
  const ready = useHydrated()
  const points = ready ? (trendQuery.data?.points ?? null) : null
  const daily = useMemo(() => (points ? aggregateToDaily(points) : []), [points])
  const expectTrend = (weeklyTrend?.points.length ?? 0) > 0

  return (
    <div className="flex h-full flex-col rounded-xl border bg-card p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-medium">{t('admin.welcome.visit.title')}</h2>
        <Button type="button" variant="ghost" size="sm" render={<Link to="/admin/analytics?preset=today" />}>
          <span className="hidden sm:inline">{t('admin.welcome.visit.details')}</span> <ArrowRightIcon data-icon />
        </Button>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{t('admin.welcome.visit.subtitle')}</p>

      <ul className="mt-6 flex flex-1 flex-col justify-center gap-5">
        {KPI_ENTRIES.map((entry, i) => {
          const Icon = entry.icon
          return (
            <li key={entry.labelId} className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-status-info-bg">
                <Icon aria-hidden="true" className="size-5 text-status-info-fg" strokeWidth={1.8} />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{t(entry.labelId)}</p>
                <p className="text-xl font-semibold tabular-nums">{formatNumber(values[i] ?? 0, { locale })}</p>
              </div>
            </li>
          )
        })}
      </ul>

      {daily.length > 0 ? (
        <div className="mt-5 border-t pt-4">
          <div className="flex items-center gap-2">
            <TrendingUpIcon className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium">{t('admin.welcome.visit.trend')}</span>
          </div>
          <div className="mt-3 flex items-end gap-4">
            <TrendSparkline points={daily} />
            <div className="mb-1 flex flex-col gap-0.5 text-right">
              <span className="text-2xl font-semibold tabular-nums">{daily.reduce((s, d) => s + d.visits, 0)}</span>
              <span className="text-xs text-muted-foreground">{t('admin.welcome.visit.totalVisits')}</span>
            </div>
          </div>
        </div>
      ) : (
        expectTrend && <TrendSkeleton />
      )}
    </div>
  )
}

function TrendSkeleton() {
  const { t } = useI18n()
  return (
    <div className="mt-5 border-t pt-4" role="status" aria-busy="true">
      <span className="sr-only">{t('common.state.loading')}</span>
      <div aria-hidden="true">
        <div className="flex items-center gap-2">
          <Skeleton className="size-4 rounded-sm" />
          <Skeleton className="h-4 w-20 rounded-sm" />
        </div>
        <div className="mt-3 flex items-end gap-4">
          <Skeleton className="h-16 w-full max-w-xs rounded-sm" />
          <Skeleton className="mb-1 h-8 w-14 rounded-sm" />
        </div>
      </div>
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
      ? `M${pathPoints[0]}${pathPoints
          .slice(1)
          .map((p) => ` L${p}`)
          .join('')} L${padding + chartW},${padding + chartH} L${padding},${padding + chartH} Z`
      : ''

  const linePath =
    pathPoints.length > 0
      ? `M${pathPoints[0]}${pathPoints
          .slice(1)
          .map((p) => ` L${p}`)
          .join('')}`
      : ''

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-16 w-full max-w-xs" preserveAspectRatio="none">
      <defs>
        <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.25" />
          <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {areaPath && <path d={areaPath} fill="url(#trendGradient)" />}
      {linePath && (
        <path
          d={linePath}
          fill="none"
          stroke="var(--primary)"
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
    const date = dayKeyOfLabel(p.time)
    const existing = map.get(date) ?? { visits: 0, visitors: 0 }
    existing.visits += p.visits
    existing.visitors += p.visitors
    map.set(date, existing)
  }
  return Array.from(map.entries())
    .map(([date, vals]) => Object.assign({ date }, vals))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}
