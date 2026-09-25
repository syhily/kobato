import NumberFlow from '@number-flow/react'
import { useQuery } from '@tanstack/react-query'
import { FlameIcon, MousePointerClickIcon, UsersIcon } from 'lucide-react'

import type { CountersDto } from '@/shared/contracts/analytics'

import { orpcQuery } from '@/client/api/orpc-query'
import { useAnalyticsDashboardState } from '@/ui/admin/analytics/analytics-state-context'
import { AnalyticsQueryState } from '@/ui/admin/analytics/AnalyticsQueryState'
import { useAnalyticsQueryData } from '@/ui/admin/analytics/use-analytics-query'
import { buildAnalyticsInput, type AnalyticsScope } from '@/ui/admin/analytics/use-analytics-state'
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/components/card'
import { Skeleton } from '@/ui/components/skeleton'
import { cn } from '@/ui/lib/cn'

// Three KPI cards modeled on Slite's `analysis/Counters.vue`: NumberFlow
// animated digits, a first-load skeleton, opacity-60 while refetching, and
// an error alert with retry. Self-fetching — `initial` is the loader's
// first-paint payload shown until the client query resolves.

const CARDS: { key: keyof CountersDto; label: string; icon: typeof MousePointerClickIcon }[] = [
  { key: 'visits', label: '访问量', icon: MousePointerClickIcon },
  { key: 'visitors', label: '访客数', icon: UsersIcon },
  { key: 'referers', label: '来源域名', icon: FlameIcon },
]

export interface CountersProps {
  initial?: CountersDto | null
  className?: string
  scope?: AnalyticsScope
}

export function Counters({ initial, className, scope }: CountersProps) {
  const state = useAnalyticsDashboardState()
  const query = useQuery(
    orpcQuery.analytics.counters.queryOptions({
      input: buildAnalyticsInput(state, { scope }),
    }),
  )

  const { data, hasLoaded, isError, refetching, isFetching, retry } = useAnalyticsQueryData(query, initial)

  return (
    <AnalyticsQueryState
      isError={isError}
      onRetry={retry}
      isLoading={false}
      isEmpty={false}
      skeleton={null}
      className={cn('rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3', className)}
    >
      <div className={cn('grid grid-cols-1 gap-4 sm:grid-cols-3', className)} aria-busy={isFetching}>
        {CARDS.map((card) => {
          const Icon = card.icon
          return (
            <Card key={card.key} className="gap-2 py-4 shadow-none">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-medium">{card.label}</CardTitle>
                <Icon aria-hidden className="size-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="relative min-h-8">
                  {data && (
                    <NumberFlow
                      className={cn(
                        'block text-2xl font-bold tabular-nums transition-opacity motion-reduce:transition-none',
                        refetching && 'opacity-60',
                      )}
                      value={data[card.key]}
                      format={{ notation: 'standard' }}
                    />
                  )}
                  {!hasLoaded && <Skeleton className="absolute inset-y-0 left-0 h-8 w-20" aria-hidden />}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </AnalyticsQueryState>
  )
}
