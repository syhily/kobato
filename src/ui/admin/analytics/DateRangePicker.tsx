import type { DateRange as DayPickerRange } from 'react-day-picker'

import { useState } from 'react'

import type { AppLocale } from '@/shared/i18n/locales'
import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'

import { type DateRange, type PresetKey, PRESET_KEYS } from '@/shared/contracts/analytics'
import { formatDate } from '@/shared/i18n/format'
import { getClientTimezone } from '@/ui/admin/analytics/use-analytics-state'
import { Button } from '@/ui/components/button'
import { Calendar } from '@/ui/components/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/components/popover'
import { cn } from '@/ui/lib/cn'
import { useI18n } from '@/ui/lib/I18nProvider'

// Preset chip row for the seven canonical ranges plus a 自定义 chip that
// opens a two-month range-calendar popover (the shared admin range-picker
// idiom) writing ?startAt&endAt. While a custom range is active
// (preset === null) the chip shows the formatted range.

const PRESET_LABEL_IDS: Record<PresetKey, UiMessageId> = {
  'last-1h': 'admin.analytics.preset.last1h',
  today: 'admin.analytics.preset.today',
  yesterday: 'admin.analytics.preset.yesterday',
  'last-7d': 'admin.analytics.preset.last7d',
  'last-30d': 'admin.analytics.preset.last30d',
  'last-90d': 'admin.analytics.preset.last90d',
  'last-365d': 'admin.analytics.preset.last365d',
}

function shortDate(unixSec: number, options: { locale: AppLocale; timeZone: string }): string {
  // Analytics dates stay BROWSER-zoned; the formatting locale follows the UI.
  return formatDate(new Date(unixSec * 1000), {
    locale: options.locale,
    timeZone: options.timeZone,
    dateStyle: 'short',
  })
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
  const { locale, t } = useI18n()
  const timeZone = getClientTimezone()
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
    <div className={cn('flex flex-wrap items-center gap-1', className)} aria-label={t('admin.analytics.preset.aria')}>
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
            {t(PRESET_LABEL_IDS[p])}
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
              {customActive
                ? `${shortDate(range.startAt, { locale, timeZone })} – ${shortDate(range.endAt, { locale, timeZone })}`
                : t('admin.analytics.preset.custom')}
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
