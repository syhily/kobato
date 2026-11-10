import type { ReactNode } from 'react'

import { Button } from '@/ui/components/button'
import { cn } from '@/ui/lib/cn'
import { useI18n } from '@/ui/lib/I18nProvider'

// Query-state chrome for the self-fetching analytics panels; fixed precedence:
// error → loading → empty → content. `skeleton` stays panel-owned to match its geometry.

export interface AnalyticsQueryStateProps {
  isError: boolean
  onRetry: () => void
  isLoading: boolean
  isEmpty: boolean
  skeleton: ReactNode
  className?: string
  children: ReactNode
}

export function AnalyticsQueryState({
  isError,
  onRetry,
  isLoading,
  isEmpty,
  skeleton,
  className,
  children,
}: AnalyticsQueryStateProps) {
  const { t } = useI18n()
  if (isError) {
    return (
      <div className={cn('flex items-center gap-2 text-sm text-destructive', className)} role="alert">
        <span>{t('admin.analytics.loadFailed')}</span>
        <Button type="button" variant="link" size="sm" className="text-destructive" onClick={onRetry}>
          {t('common.action.retry')}
        </Button>
      </div>
    )
  }

  if (isLoading) {
    return <>{skeleton}</>
  }

  if (isEmpty) {
    return (
      <div className={cn('flex items-center justify-center text-sm text-muted-foreground', className)} role="status">
        {t('admin.analytics.empty')}
      </div>
    )
  }

  return <>{children}</>
}
