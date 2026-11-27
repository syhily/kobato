import type { AppLocale } from '@kobato/i18n/locales'
import type { UiMessageId } from '@kobato/i18n/messages/ui/en-US'
import type { DateRange as DayPickerRange } from 'react-day-picker'

import { type DateRange, type PresetKey, PRESET_KEYS } from '@kobato/base/utils/date-range'
import { formatDate } from '@kobato/base/utils/format'
import { Button } from '@kobato/ui/components/button'
import { Calendar } from '@kobato/ui/components/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@kobato/ui/components/popover'
import { cn } from '@kobato/ui/lib/cn'
import { useI18n } from '@kobato/ui/lib/I18nProvider'
import { getClientTimezone } from '@kobato/web-admin/ui/analytics/use-analytics-state'
import { useState } from 'react'

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
  return formatDate(new Date(unixSec * 1000), {
    locale: options.locale,
    timeZone: options.timeZone,
    dateStyle: 'short',
  })
}

function startOfDaySec(date: Date): number {
  return Math.floor(new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() / 1000)
}

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
            resetOnSelect
            selected={
              pending ??
              (customActive
                ? { from: new Date(range.startAt * 1000), to: new Date(range.endAt * 1000 - 1) }
                : undefined)
            }
            onSelect={(selected) => {
              if (!selected?.from || !selected.to) {
                setPending(selected)
                return
              }
              setPending(undefined)
              onSelectRange({ startAt: startOfDaySec(selected.from), endAt: startOfNextDaySec(selected.to) })
              setCustomOpen(false)
            }}
            disabled={(date) => date.getTime() > Date.now()}
            numberOfMonths={2}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}
