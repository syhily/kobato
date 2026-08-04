import { METRIC_TYPES, type Filters, type MetricType } from '@kobato/shared/contracts/analytics'
import { Badge } from '@kobato/ui/components/badge'
import { Button } from '@kobato/ui/components/button'
import { cn } from '@kobato/ui/lib/cn'
import { XIcon } from 'lucide-react'

const TYPE_LABEL: Record<MetricType, string> = {
  country: '国家',
  region: '地区',
  city: '城市',
  referer: '来源',
  language: '语言',
  timezone: '时区',
  os: '系统',
  browser: '浏览器',
  browserType: '浏览器类型',
  device: '设备',
  deviceType: '设备类型',
  path: '路径',
}

export interface FiltersBarProps {
  filters: Filters
  onClear: (type: MetricType) => void
  onClearAll: () => void
  className?: string
}

export function FiltersBar({ filters, onClear, onClearAll, className }: FiltersBarProps) {
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
    <section className={cn('flex flex-wrap items-center gap-2', className)} aria-label="已应用的筛选">
      {entries.map(([type, value]) => (
        <Badge key={type} variant="secondary" className="gap-1 py-1 pr-1 pl-2.5 font-normal">
          <span className="text-muted-foreground">{TYPE_LABEL[type]}:</span>
          <span className="text-foreground">{value}</span>
          <button
            type="button"
            onClick={() => onClear(type)}
            aria-label={`移除 ${TYPE_LABEL[type]} 筛选`}
            className="ml-0.5 rounded-sm p-0.5 text-muted-foreground hover:bg-muted-foreground/15 hover:text-foreground"
          >
            <XIcon className="size-3" />
          </button>
        </Badge>
      ))}
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-7 px-2 text-xs text-muted-foreground"
        onClick={onClearAll}
      >
        清空筛选
      </Button>
    </section>
  )
}
