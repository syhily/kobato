import type { MetricRow, MetricType } from '@/shared/contracts/analytics'

import { MetricName } from '@/ui/admin/analytics/MetricName'
import { cn } from '@/ui/lib/cn'

// Pure row list shared by the group card (top 10) and the details dialog
// (full set): name + count(percent) + a chart-1 progress bar, modeled on
// Slite's `metrics/List.vue`. `total` is the caller-computed FULL-set visit
// sum, so the card's sliced top-10 rows still show shares of the whole
// result. Clicking a non-empty row pushes it as a filter.

export interface MetricRowsProps {
  rows: MetricRow[]
  total: number
  type: MetricType
  onSelect?: (type: MetricType, value: string) => void
  className?: string
}

export function MetricRows({ rows, total, type, onSelect, className }: MetricRowsProps) {
  return (
    <div className={cn('w-full text-sm', className)}>
      <div className="flex justify-between border-b leading-[40px]">
        <div className="px-4 text-left align-middle font-medium text-muted-foreground">名称</div>
        <div className="px-4 text-right align-middle font-medium text-muted-foreground">数量</div>
      </div>
      <ul>
        {rows.map((row) => {
          const percent = total > 0 ? Math.floor((row.visits / total) * 100) || (row.visits ? 1 : 0) : 0
          const clickable = row.name.length > 0 && onSelect !== undefined
          return (
            <li key={row.name || '(empty)'} className="border-b last:border-b-0">
              <button
                type="button"
                disabled={!clickable}
                onClick={() => onSelect?.(type, row.name)}
                className={cn(
                  'w-full px-4 py-2 text-left transition-colors motion-reduce:transition-none',
                  clickable
                    ? 'hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none'
                    : 'cursor-default',
                )}
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="min-w-0 flex-1 leading-5">
                    <MetricName name={row.name} type={type} />
                  </span>
                  <span className="shrink-0 text-right tabular-nums">
                    {row.visits.toLocaleString()}
                    <span className="text-xs text-muted-foreground"> ({percent}%)</span>
                  </span>
                </span>
                <span
                  className="mt-1 block h-2 w-full rounded-full bg-muted"
                  role="progressbar"
                  aria-label={`数量占比: ${percent}%`}
                  aria-valuenow={percent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <span className="block h-full rounded-full bg-chart-1" style={{ width: `${percent}%` }} aria-hidden />
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
