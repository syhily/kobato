import type { CountersDto } from '@kobato/contracts/analytics.ts'
import type { UiMessageId } from '@kobato/i18n/messages/ui/en-US.ts'

import { Card, CardContent, CardHeader, CardTitle } from '@kobato/ui/components/card.tsx'
import { Skeleton } from '@kobato/ui/components/skeleton.tsx'
import { cn } from '@kobato/ui/lib/cn.ts'
import { useI18n } from '@kobato/ui/lib/I18nProvider.tsx'
import { useAnalyticsDashboardState } from '@kobato/web-admin/ui/analytics/analytics-state-context.tsx'
import { AnalyticsQueryState } from '@kobato/web-admin/ui/analytics/AnalyticsQueryState.tsx'
import { useAnalyticsQueryData } from '@kobato/web-admin/ui/analytics/use-analytics-query.ts'
import { buildAnalyticsInput, type AnalyticsScope } from '@kobato/web-admin/ui/analytics/use-analytics-state.ts'
import { orpcQuery } from '@kobato/web-client/api/orpc-query.ts'
import NumberFlow from '@number-flow/react'
import { useQuery } from '@tanstack/react-query'
import { FlameIcon, MousePointerClickIcon, UsersIcon } from 'lucide-react'

const CARDS: { key: keyof CountersDto; labelId: UiMessageId; icon: typeof MousePointerClickIcon }[] = [
  { key: 'visits', labelId: 'admin.analytics.metric.visits', icon: MousePointerClickIcon },
  { key: 'visitors', labelId: 'admin.analytics.metric.visitors', icon: UsersIcon },
  { key: 'referers', labelId: 'admin.analytics.metric.referers', icon: FlameIcon },
]

export interface CountersProps {
  initial?: CountersDto | null
  className?: string
  scope?: AnalyticsScope
}

export function Counters({ initial, className, scope }: CountersProps) {
  const { t } = useI18n()
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
                <CardTitle className="text-sm font-medium">{t(card.labelId)}</CardTitle>
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
