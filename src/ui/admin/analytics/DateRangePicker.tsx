import { useState } from 'react'

import { type DateRange, type PresetKey, PRESET_KEYS } from '@/shared/contracts/analytics'
import { CustomRangeDialog } from '@/ui/admin/analytics/CustomRangeDialog'
import { Button } from '@/ui/components/button'
import { cn } from '@/ui/lib/cn'

// Preset chip row for the seven canonical ranges plus a 自定义 chip that
// opens the custom-range modal writing ?startAt&endAt. While a custom range
// is active (preset === null) the chip shows the formatted range.

const PRESET_LABEL: Record<PresetKey, string> = {
  'last-1h': '最近 1 小时',
  today: '今天',
  yesterday: '昨天',
  'last-7d': '最近 7 天',
  'last-30d': '最近 30 天',
  'last-90d': '最近 90 天',
  'last-365d': '最近 365 天',
}

function shortDate(unixSec: number): string {
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short' }).format(unixSec * 1000)
}

export interface DateRangePickerProps {
  preset: PresetKey | null
  range: DateRange
  onSelect: (preset: PresetKey) => void
  onSelectRange: (range: DateRange) => void
  className?: string
}

export function DateRangePicker({ preset, range, onSelect, onSelectRange, className }: DateRangePickerProps) {
  const [customOpen, setCustomOpen] = useState(false)
  const customActive = preset === null

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
      <Button
        type="button"
        size="sm"
        variant={customActive ? 'default' : 'outline'}
        aria-pressed={customActive}
        aria-haspopup="dialog"
        onClick={() => setCustomOpen(true)}
        className={cn('h-8 px-3 text-xs font-medium', !customActive && 'bg-transparent')}
      >
        {customActive ? `${shortDate(range.startAt)} – ${shortDate(range.endAt)}` : '自定义'}
      </Button>
      <CustomRangeDialog open={customOpen} onOpenChange={setCustomOpen} range={range} onSelect={onSelectRange} />
    </div>
  )
}
