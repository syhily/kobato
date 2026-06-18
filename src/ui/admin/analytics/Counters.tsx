import NumberFlow from '@number-flow/react'

import type { CountersDto } from '@/shared/contracts/analytics'

import { Card } from '@/ui/components/card'
import { cn } from '@/ui/lib/cn'

// Three KPI cards (visits / visitors / referers). Pure-props — the
// parent route's loader queries `analytics.counters` and hands the
// resolved DTO down. `NumberFlow` animates the digit roll on every
// value change, so URL-driven re-fetches feel kinetic without us
// owning any animation state.

export interface CountersProps {
  data: CountersDto | null
  className?: string
}

const CARDS: { key: keyof CountersDto; label: string; description: string }[] = [
  { key: 'visits', label: '访问量', description: '区间内的总浏览次数' },
  { key: 'visitors', label: '访客数', description: '按当日盐哈希去重' },
  { key: 'referers', label: '来源域名', description: '不同的 referer 主机数' },
]

export function Counters({ data, className }: CountersProps) {
  return (
    <div className={cn('grid grid-cols-1 gap-4 md:grid-cols-3', className)}>
      {CARDS.map((card) => (
        <Card key={card.key} className="gap-3 px-6 py-5 shadow-none">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-muted-foreground">{card.label}</span>
            <span className="text-xs text-muted-foreground/70">{card.description}</span>
          </div>
          <div className="text-3xl font-bold tabular-nums">
            {data ? (
              <NumberFlow value={data[card.key]} format={{ notation: 'standard' }} />
            ) : (
              <span className="inline-block h-9 w-24 animate-pulse rounded bg-muted" aria-hidden />
            )}
          </div>
        </Card>
      ))}
    </div>
  )
}
