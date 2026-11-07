import type { DropdownProps } from 'react-day-picker'

import { CalendarIcon } from 'lucide-react'
import { useMemo, useState } from 'react'

import { formatDate, formatDateTime } from '@/shared/i18n/format'
import { dateToLocalInputValue, parseLocalDateTimeInput } from '@/ui/admin/editor-shell/editor-datetime'
import { Button } from '@/ui/components/button'
import { Calendar, calendarWallClockDate } from '@/ui/components/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/components/popover'
import { cn } from '@/ui/lib/cn'
import { useI18n } from '@/ui/lib/I18nProvider'

// The picker edits BROWSER-LOCAL wall-clock parts. Every rendered value is
// normalized onto UTC and formatted in UTC, so SSR and the first client render
// produce identical text on any host; the parts themselves are zone-free.
const WALL_CLOCK_ZONE = 'Etc/UTC'

export interface DateTimePickerProps {
  value: string
  onChange: (next: string) => void
  disabled?: boolean
  id?: string
}

const HOURS_12 = Array.from({ length: 12 }, (_, i) => i + 1)
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5)

const CALENDAR_COMPONENTS = { Dropdown: CalendarDropdown }

// Placeholder center for the pre-open year window — the calendar mounts only
// once the popover opens, and the open handler re-anchors on the real year.
const PRE_OPEN_YEAR = 2000

export function DateTimePicker({ value, onChange, disabled, id }: DateTimePickerProps) {
  const { locale, t } = useI18n()
  const [open, setOpen] = useState(false)
  const parsed = parseLocalDateTimeInput(value)
  const triggerId = id ?? 'datetime-picker'

  // "Now" is render-impure, so the calendar's year window anchors on the
  // popover-open event instead of render; before the first open the calendar
  // is not mounted and the placeholder window is never painted.
  const [openedYear, setOpenedYear] = useState<number | null>(null)
  const { startMonth, endMonth } = useMemo(() => {
    const currentYear = openedYear ?? parsed?.getFullYear() ?? PRE_OPEN_YEAR
    const selectedYear = parsed?.getFullYear() ?? currentYear
    const oldestYear = Math.min(currentYear - 30, selectedYear)
    const newestYear = Math.max(currentYear + 2, selectedYear)
    return {
      startMonth: new Date(oldestYear, 0, 1),
      endMonth: new Date(newestYear, 11, 31),
    }
  }, [parsed, openedYear])

  const calendarFormatters = useMemo(
    () => ({
      formatMonthDropdown: (date: Date) => formatWallClockMonth(date, locale),
      formatYearDropdown: (date: Date) => t('common.datetime.yearOption', { year: date.getFullYear() }),
    }),
    [locale, t],
  )

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (nextOpen) {
      setOpenedYear(new Date().getFullYear())
    }
  }

  const commit = (next: Date) => {
    onChange(dateToLocalInputValue(next))
  }

  const handleDateSelect = (selectedDate: Date | undefined) => {
    if (selectedDate === undefined) {
      onChange('')
      return
    }
    const base = parsed ?? defaultTime()
    const next = new Date(selectedDate)
    next.setHours(base.getHours(), base.getMinutes(), 0, 0)
    commit(next)
  }

  const handleHour = (hour12: number) => {
    const base = parsed ?? defaultTime()
    const next = new Date(base)
    const isPm = base.getHours() >= 12
    next.setHours((hour12 % 12) + (isPm ? 12 : 0))
    commit(next)
  }

  const handleMinute = (minute: number) => {
    const base = parsed ?? defaultTime()
    const next = new Date(base)
    next.setMinutes(minute)
    commit(next)
  }

  const handleAmPm = (target: 'am' | 'pm') => {
    const base = parsed ?? defaultTime()
    const next = new Date(base)
    const hours = next.getHours()
    if (target === 'am' && hours >= 12) {
      next.setHours(hours - 12)
    } else if (target === 'pm' && hours < 12) {
      next.setHours(hours + 12)
    }
    commit(next)
  }

  const display = parsed === null ? t('common.datetime.placeholder') : formatWallClockDateTime(parsed, locale)

  const currentHour12 = parsed === null ? null : ((parsed.getHours() + 11) % 12) + 1
  const currentMinute = parsed?.getMinutes() ?? null
  const currentIsPm = parsed === null ? null : parsed.getHours() >= 12

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        render={
          <Button
            id={triggerId}
            variant="outline"
            type="button"
            disabled={disabled}
            data-empty={parsed === null}
            className={cn('w-full justify-start text-left font-normal data-[empty=true]:text-muted-foreground')}
          >
            <CalendarIcon className="mr-2" />
            {display}
          </Button>
        }
      />
      <PopoverContent align="start" className="w-auto overflow-hidden p-0">
        <div className="flex flex-col sm:flex-row">
          <Calendar
            mode="single"
            selected={parsed ?? undefined}
            defaultMonth={parsed ?? undefined}
            captionLayout="dropdown"
            startMonth={startMonth}
            endMonth={endMonth}
            formatters={calendarFormatters}
            components={CALENDAR_COMPONENTS}
            onSelect={handleDateSelect}
            disabled={disabled}
          />
          <div className="flex divide-x border-t sm:h-75 sm:border-t-0 sm:border-l">
            <ColumnScroller>
              {HOURS_12.map((hour) => (
                <SlotButton
                  key={hour}
                  active={currentHour12 === hour}
                  onClick={() => handleHour(hour)}
                  disabled={disabled}
                  aria-label={t('common.datetime.hourOption', { hour })}
                >
                  {pad(hour)}
                </SlotButton>
              ))}
            </ColumnScroller>
            <ColumnScroller>
              {MINUTES.map((minute) => (
                <SlotButton
                  key={minute}
                  active={currentMinute === minute}
                  onClick={() => handleMinute(minute)}
                  disabled={disabled}
                  aria-label={t('common.datetime.minuteOption', { minute })}
                >
                  {pad(minute)}
                </SlotButton>
              ))}
            </ColumnScroller>
            <ColumnScroller>
              <SlotButton
                active={currentIsPm === false}
                onClick={() => handleAmPm('am')}
                disabled={disabled}
                aria-label={t('common.datetime.am')}
              >
                {t('common.datetime.am')}
              </SlotButton>
              <SlotButton
                active={currentIsPm === true}
                onClick={() => handleAmPm('pm')}
                disabled={disabled}
                aria-label={t('common.datetime.pm')}
              >
                {t('common.datetime.pm')}
              </SlotButton>
            </ColumnScroller>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function CalendarDropdown({ options, ...selectProps }: DropdownProps) {
  const { t } = useI18n()
  return (
    <select
      {...selectProps}
      value={String(selectProps.value ?? '')}
      aria-label={t('common.datetime.monthYearSelector')}
      className={cn(
        'h-8 w-auto appearance-none rounded-md border border-input bg-background px-2 pr-6 text-sm shadow-sm transition-colors focus-visible:shadow-focus focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
        selectProps.className,
      )}
    >
      {options?.map(({ value, label, disabled }) => (
        <option key={value} value={String(value)} disabled={disabled}>
          {label}
        </option>
      ))}
    </select>
  )
}

function ColumnScroller({ children }: { children: React.ReactNode }) {
  return <div className="flex w-16 flex-col gap-1 overflow-y-auto p-1.5 sm:w-20">{children}</div>
}

interface SlotButtonProps {
  active: boolean
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
  'aria-label'?: string
}

function SlotButton({ active, onClick, disabled, children, 'aria-label': ariaLabel }: SlotButtonProps) {
  return (
    <Button
      type="button"
      variant={active ? 'default' : 'ghost'}
      size="sm"
      onClick={onClick}
      disabled={disabled}
      className="w-full shrink-0 font-mono"
      aria-label={ariaLabel}
    >
      {children}
    </Button>
  )
}

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}

function defaultTime(): Date {
  const d = new Date()
  d.setHours(9, 0, 0, 0)
  return d
}

/** Wall-clock parts normalized onto UTC, so the rendered text is host-zone independent. */
export function wallClockInstant(date: Date): Date {
  return new Date(
    Date.UTC(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      date.getHours(),
      date.getMinutes(),
      date.getSeconds(),
    ),
  )
}

/** Wall-clock date + time formatted in an explicit zone — identical on server and client. */
function formatWallClockDateTime(date: Date, locale: 'en-US' | 'zh-CN' | 'zh-HK' | 'zh-TW'): string {
  return formatDateTime(wallClockInstant(date), { locale, timeZone: WALL_CLOCK_ZONE })
}

function formatWallClockMonth(date: Date, locale: 'en-US' | 'zh-CN' | 'zh-HK' | 'zh-TW'): string {
  return formatDate(calendarWallClockDate(date), { locale, timeZone: WALL_CLOCK_ZONE, month: 'long' })
}
