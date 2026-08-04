import { type PresetKey, PRESET_KEYS } from '@kobato/shared/contracts/analytics'
import { Button } from '@kobato/ui/components/button'
import { cn } from '@kobato/ui/lib/cn'

// Sink's preset chip row — plain buttons for the seven canonical ranges,
// no calendar popover. Custom ranges go through `?startAt=`/`?endAt=`.

const PRESET_LABEL: Record<PresetKey, string> = {
  'last-1h': '最近 1 小时',
  today: '今天',
  yesterday: '昨天',
  'last-7d': '最近 7 天',
  'last-30d': '最近 30 天',
  'last-90d': '最近 90 天',
  'last-365d': '最近 365 天',
}

export interface DateRangePickerProps {
  preset: PresetKey | null
  onSelect: (preset: PresetKey) => void
  className?: string
}

export function DateRangePicker({ preset, onSelect, className }: DateRangePickerProps) {
  return (
    <div className={cn('flex flex-wrap items-center gap-1', className)} aria-label="时间范围">
      {PRESET_KEYS.map((p) => {
        const active = preset === p
        return (
          <Button
            key={p}
            type="button"
            size="sm"
            variant={active ? 'default' : 'outline'}
            aria-pressed={active}
            onClick={() => onSelect(p)}
            className={cn('h-8 px-3 text-xs font-medium', !active && 'bg-transparent')}
          >
            {PRESET_LABEL[p]}
          </Button>
        )
      })}
    </div>
  )
}
