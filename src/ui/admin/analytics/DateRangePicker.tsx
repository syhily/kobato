import type { DateRange as DayPickerRange } from 'react-day-picker'

import { useState } from 'react'

import { type DateRange, type PresetKey, PRESET_KEYS } from '@/shared/contracts/analytics'
import { Button } from '@/ui/components/button'
import { Calendar } from '@/ui/components/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/components/popover'
import { cn } from '@/ui/lib/cn'

// Preset chip row for the seven canonical ranges plus a 自定义 chip that
// opens a two-month range-calendar popover (the shared admin range-picker
// idiom) writing ?startAt&endAt. While a custom range is active
// (preset === null) the chip shows the formatted range.

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

/** Local midnight at the start of the given day, in unix seconds. */
function startOfDaySec(date: Date): number {
  return Math.floor(new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() / 1000)
}

/** Local midnight at the start of the day AFTER the given day (DST-safe). */
function startOfNextDaySec(date: Date): number {
  return Math.floor(new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime() / 1000)
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
  // The calendar is fully controlled, so the first click's start-only
  // selection must be fed back as `selected` — otherwise the second click
  // would reset again instead of completing the range.
  const [pending, setPending] = useState<DayPickerRange | undefined>(undefined)
  const customActive = preset === null

  const handleOpenChange = (open: boolean) => {
    setCustomOpen(open)
    if (open) {
      setPending(undefined)
    }
  }

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
      <Popover open={customOpen} onOpenChange={handleOpenChange}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              size="sm"
              variant={customActive ? 'default' : 'outline'}
              aria-pressed={customActive}
              className={cn('h-8 px-3 text-xs font-medium', !customActive && 'bg-transparent')}
            >
              {customActive ? `${shortDate(range.startAt)} – ${shortDate(range.endAt)}` : '自定义'}
            </Button>
          }
        />
        <PopoverContent align="start" className="w-auto p-0">
          <Calendar
            mode="range"
            // react-day-picker v10 completes a same-day range on the FIRST
            // click without this — resetOnSelect restores the two-click flow
            // (first click = start only, second click = end).
            resetOnSelect
            selected={
              pending ??
              (customActive
                ? // `endAt` is the exclusive next-midnight — back off a
                  // millisecond so the last included day highlights.
                  { from: new Date(range.startAt * 1000), to: new Date(range.endAt * 1000 - 1) }
                : undefined)
            }
            onSelect={(selected) => {
              if (!selected?.from || !selected.to) {
                setPending(selected)
                return
              }
              // Day granularity: startAt = local midnight of the first day,
              // endAt = local midnight of the day after the last (exclusive).
              setPending(undefined)
              onSelectRange({ startAt: startOfDaySec(selected.from), endAt: startOfNextDaySec(selected.to) })
              setCustomOpen(false)
            }}
            // Days are midnight-valued, so `> now` disables tomorrow onward
            // while keeping today selectable (evaluated by the calendar,
            // never during this component's render).
            disabled={(date) => date.getTime() > Date.now()}
            numberOfMonths={2}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}
