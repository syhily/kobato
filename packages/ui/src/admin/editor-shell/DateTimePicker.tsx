import type { DropdownProps } from 'react-day-picker'

import { dateToLocalInputValue, parseLocalDateTimeInput } from '@kobato/ui/admin/editor-shell/editor-datetime'
import { Button } from '@kobato/ui/components/button'
import { Calendar } from '@kobato/ui/components/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@kobato/ui/components/popover'
import { cn } from '@kobato/ui/lib/cn'
import { zhCN } from 'date-fns/locale'
import { CalendarIcon } from 'lucide-react'
import { useMemo, useState } from 'react'

export interface DateTimePickerProps {
  value: string
  onChange: (next: string) => void
  disabled?: boolean
  id?: string
}

const HOURS_12 = Array.from({ length: 12 }, (_, i) => i + 1)
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5)

const CALENDAR_FORMATTERS = {
  formatMonthDropdown: (date: Date) => new Intl.DateTimeFormat('zh-CN', { month: 'long' }).format(date),
  formatYearDropdown: (date: Date) => `${date.getFullYear()} 年`,
}

const CALENDAR_COMPONENTS = { Dropdown: CalendarDropdown }

export function DateTimePicker({ value, onChange, disabled, id }: DateTimePickerProps) {
  const [open, setOpen] = useState(false)
  const parsed = parseLocalDateTimeInput(value)
  const triggerId = id ?? 'datetime-picker'

  const { startMonth, endMonth } = useMemo(() => {
    const now = new Date()
    const currentYear = now.getFullYear()
    const selectedYear = parsed?.getFullYear() ?? currentYear
    const oldestYear = Math.min(currentYear - 30, selectedYear)
    const newestYear = Math.max(currentYear + 2, selectedYear)
    return {
      startMonth: new Date(oldestYear, 0, 1),
      endMonth: new Date(newestYear, 11, 31),
    }
  }, [parsed])

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

  const display =
    parsed === null
      ? '选择日期与时间'
      : `${new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }).format(parsed)} ${parsed.getHours() < 12 ? '上午' : '下午'} ${pad(((parsed.getHours() + 11) % 12) + 1)}:${pad(parsed.getMinutes())}`

  const currentHour12 = parsed === null ? null : ((parsed.getHours() + 11) % 12) + 1
  const currentMinute = parsed?.getMinutes() ?? null
  const currentIsPm = parsed === null ? null : parsed.getHours() >= 12

  return (
    <Popover open={open} onOpenChange={setOpen}>
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
            locale={zhCN}
            startMonth={startMonth}
            endMonth={endMonth}
            // Override the calendar's default `formatMonthDropdown`
            // (which hardcodes `toLocaleString('default', …)` and
            // therefore renders English month abbreviations regardless
            // of the active locale prop) with a zhCN-bound formatter.
            formatters={CALENDAR_FORMATTERS}
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
                  aria-label={`${hour} 时`}
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
                  aria-label={`${minute} 分`}
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
                aria-label="上午"
              >
                上午
              </SlotButton>
              <SlotButton
                active={currentIsPm === true}
                onClick={() => handleAmPm('pm')}
                disabled={disabled}
                aria-label="下午"
              >
                下午
              </SlotButton>
            </ColumnScroller>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function CalendarDropdown({ options, ...selectProps }: DropdownProps) {
  return (
    <select
      {...selectProps}
      value={String(selectProps.value ?? '')}
      aria-label="选择月份或年份"
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
