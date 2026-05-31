import type { MetricRow, MetricType } from '@/shared/contracts/analytics'

import { orpcQuery, useQuery } from '@/client/api/query'
import { useAnalyticsState } from '@/ui/admin/analytics/use-analytics-state'
import { Skeleton } from '@/ui/components/skeleton'
import { cn } from '@/ui/lib/cn'

// Generic top-N list for one metric type. Each row carries a horizontal
// progress bar whose width is `value / maxValue`. Clicking a row
// pushes the dimension's value as a filter through `useAnalyticsState`,
// matching Sink's drill-down convention.

export interface MetricListProps {
  type: MetricType
  initial?: MetricRow[]
  className?: string
  entityType?: 'post' | 'page'
  entityId?: string
}

export function MetricList({ type, initial, className, entityType, entityId }: MetricListProps) {
  const state = useAnalyticsState()
  const query = useQuery(
    orpcQuery.analytics.metrics.queryOptions({
      input: {
        type,
        preset: state.preset ?? undefined,
        startAt: state.preset ? undefined : String(state.range.startAt),
        endAt: state.preset ? undefined : String(state.range.endAt),
        filters: Object.keys(state.filters).length > 0 ? JSON.stringify(state.filters) : undefined,
        limit: 10,
        entityType,
        entityId,
      },
    }),
  )

  const rows = query.data ?? initial ?? null

  if (rows === null) {
    return (
      <div className={cn('flex flex-col gap-2', className)}>
        {Array.from({ length: 5 }).map((_, i) => (
          // Skeleton placeholders — identical non-interactive items
          // that disappear in one shot when data arrives.
          // oxlint-disable-next-line react/no-array-index-key
          <Skeleton key={i} className="h-8 w-full rounded-xl" />
        ))}
      </div>
    )
  }

  if (rows.length === 0) {
    return <div className={cn('py-6 text-center text-sm text-muted-foreground', className)}>暂无数据</div>
  }

  const max = Math.max(...rows.map((r) => r.visits), 1)

  return (
    <ul className={cn('flex flex-col gap-1', className)}>
      {rows.map((row) => {
        const ratio = row.visits / max
        return (
          <li key={row.name}>
            <button
              type="button"
              className="group relative flex w-full items-center gap-2 overflow-hidden rounded-xl px-2 py-1.5 text-sm transition-colors hover:bg-accent/60 focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
              onClick={() => state.setFilter(type, row.name)}
            >
              <span
                className="absolute inset-y-0 left-0 -z-0 rounded-xl"
                style={{
                  width: `${ratio * 100}%`,
                  background: 'color-mix(in srgb, var(--color-chart-1, #6366f1) 14%, transparent)',
                }}
                aria-hidden
              />
              <span className="relative z-10 flex-1 truncate text-left text-foreground">{row.name}</span>
              <span className="relative z-10 ml-auto text-xs text-muted-foreground tabular-nums group-hover:text-foreground">
                {row.visits.toLocaleString()}
              </span>
              <span className="relative z-10 ml-1 hidden text-xs text-muted-foreground tabular-nums sm:inline">
                ({row.visitors.toLocaleString()})
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
