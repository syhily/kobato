import type { DateRange } from 'react-day-picker'

import { Button } from '@kobato/ui/components/button'
import { Calendar } from '@kobato/ui/components/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@kobato/ui/components/popover'
import { CalendarIcon } from 'lucide-react'

const TRIGGER_CLASSES =
  'h-9 w-full justify-start gap-2 border-line bg-transparent px-3 py-2 font-normal shadow-xs transition-[color,box-shadow] data-[popup-open]:border-ring data-[popup-open]:shadow-focus'

export function parseRange(from: string, to: string): DateRange | undefined {
  const start = from ? new Date(`${from}T00:00:00`) : undefined
  const end = to ? new Date(`${to}T00:00:00`) : undefined
  if (!start && !end) {
    return undefined
  }
  return { from: start, to: end }
}

export function toIsoDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function formatRangeLabel(from: string, to: string): string {
  if (from && to) {
    return `${from} → ${to}`
  }
  if (from) {
    return `${from} 起`
  }
  if (to) {
    return `截至 ${to}`
  }
  return ''
}

interface DateRangeCalendarPickerProps {
  from: string
  to: string
  onChange: (from: string, to: string) => void
}

export function DateRangeCalendarPicker({ from, to, onChange }: DateRangeCalendarPickerProps) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button type="button" variant="outline" className={TRIGGER_CLASSES}>
            <CalendarIcon data-icon="inline-start" />
            <span className="truncate">{from || to ? formatRangeLabel(from, to) : '选择时间范围'}</span>
          </Button>
        }
      />
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="range"
          selected={parseRange(from, to)}
          onSelect={(range) => {
            onChange(range?.from ? toIsoDate(range.from) : '', range?.to ? toIsoDate(range.to) : '')
          }}
          numberOfMonths={2}
        />
      </PopoverContent>
    </Popover>
  )
}
