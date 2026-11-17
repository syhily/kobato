import { METRIC_TYPES, type Filters, type MetricType } from '@kobato/shared/contracts/analytics.ts'
import { Badge } from '@kobato/ui/components/badge.tsx'
import { Button } from '@kobato/ui/components/button.tsx'
import { cn } from '@kobato/ui/lib/cn.ts'
import { useI18n } from '@kobato/ui/lib/I18nProvider.tsx'
import { METRIC_TYPE_LABEL_IDS, metricValueLabelId } from '@kobato/web/ui/admin/analytics/metric-labels.ts'
import { XIcon } from 'lucide-react'

export interface FiltersBarProps {
  filters: Filters
  onClear: (type: MetricType) => void
  onClearAll: () => void
  className?: string
}

export function FiltersBar({ filters, onClear, onClearAll, className }: FiltersBarProps) {
  const { t } = useI18n()
  const entries: [MetricType, string][] = []
  for (const type of METRIC_TYPES) {
    const value = filters[type]
    if (typeof value === 'string') {
      entries.push([type, value])
    }
  }
  if (entries.length === 0) {
    return null
  }
  return (
    <section
      className={cn('flex flex-wrap items-center gap-2', className)}
      aria-label={t('admin.analytics.filters.appliedAria')}
    >
      {entries.map(([type, value]) => {
        const valueLabelId = metricValueLabelId(type, value)
        return (
          <Badge key={type} variant="secondary" className="gap-1 py-1 pr-1 pl-2.5 font-normal">
            <span className="text-muted-foreground">{t(METRIC_TYPE_LABEL_IDS[type])}:</span>
            <span className="text-foreground">{valueLabelId === null ? value : t(valueLabelId)}</span>
            <button
              type="button"
              onClick={() => onClear(type)}
              aria-label={t('admin.analytics.filters.removeAria', { type: t(METRIC_TYPE_LABEL_IDS[type]) })}
              className="ml-0.5 rounded-sm p-0.5 text-muted-foreground hover:bg-muted-foreground/15 hover:text-foreground"
            >
              <XIcon className="size-3" />
            </button>
          </Badge>
        )
      })}
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-7 px-2 text-xs text-muted-foreground"
        onClick={onClearAll}
      >
        {t('admin.analytics.filters.clearAll')}
      </Button>
    </section>
  )
}
