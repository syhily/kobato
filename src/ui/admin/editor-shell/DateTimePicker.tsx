import type { DropdownProps } from 'react-day-picker'

import { format } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { CalendarIcon } from 'lucide-react'
import { useMemo, useState } from 'react'

import { Button } from '@/ui/components/button'
import { Calendar } from '@/ui/components/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/components/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/components/select'
import { cn } from '@/ui/lib/cn'

// Combined date + time picker, modelled on
// https://github.com/rudrodip/shadcn-date-time-picker — single Popover
// holding a `<Calendar>` next to three scroll columns (小时 / 分钟
// / 上午下午). The AM/PM column is localised to 上午 / 下午 per the
// review brief; the wire contract stays the 24h `YYYY-MM-DDTHH:mm`
// string the rest of the editor reads.

export interface DateTimePickerProps {
  value: string
  onChange: (next: string) => void
  disabled?: boolean
  id?: string
}

const HOURS_12 = Array.from({ length: 12 }, (_, i) => i + 1)
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5)

const CALENDAR_FORMATTERS = {
  formatMonthDropdown: (date: Date) => format(date, 'LLLL', { locale: zhCN }),
  formatYearDropdown: (date: Date) => `${date.getFullYear()} 年`,
}

const CALENDAR_COMPONENTS = { Dropdown: CalendarDropdown }

export function DateTimePicker({ value, onChange, disabled, id }: DateTimePickerProps) {
  const [open, setOpen] = useState(false)
  const parsed = parseLocal(value)
  const triggerId = id ?? 'datetime-picker'

  // Year-dropdown range. The native `<select>` opens scrolled to its
  // current value, so giving it a generous backward range lets the
  // operator scroll up to pick older years while the most recent
  // five (current year + the four before) sit at the bottom of the
  // initial viewport — matching the "recent 5 by default, scroll for
  // older" UX brief. We extend the upper bound slightly so a future
  // 计划发布 can still aim a year or two ahead.
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
    onChange(toLocalInputValue(next))
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
      : `${format(parsed, 'PPP', { locale: zhCN })} ${parsed.getHours() < 12 ? '上午' : '下午'} ${pad(((parsed.getHours() + 11) % 12) + 1)}:${pad(parsed.getMinutes())}`

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
                >
                  {pad(minute)}
                </SlotButton>
              ))}
            </ColumnScroller>
            <ColumnScroller>
              <SlotButton active={currentIsPm === false} onClick={() => handleAmPm('am')} disabled={disabled}>
                上午
              </SlotButton>
              <SlotButton active={currentIsPm === true} onClick={() => handleAmPm('pm')} disabled={disabled}>
                下午
              </SlotButton>
            </ColumnScroller>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function CalendarDropdown({ options, className: _className, ...selectProps }: DropdownProps) {
  const selected = options?.find(({ value }) => value === selectProps.value)
  return (
    <span data-disabled={selectProps.disabled} className="relative">
      <Select
        value={String(selectProps.value ?? '')}
        onValueChange={(v) => {
          selectProps.onChange?.(
            Object.assign({} as React.ChangeEvent<HTMLSelectElement>, {
              target: { value: Number(v), name: selectProps.name },
            }),
          )
        }}
        disabled={selectProps.disabled}
      >
        <SelectTrigger className="h-8 w-auto gap-1 px-2 text-sm">
          <SelectValue placeholder={selected?.label} />
        </SelectTrigger>
        <SelectContent>
          {options?.map(({ value, label, disabled }) => (
            <SelectItem key={value} value={String(value)} disabled={disabled}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </span>
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
}

function SlotButton({ active, onClick, disabled, children }: SlotButtonProps) {
  return (
    <Button
      type="button"
      variant={active ? 'default' : 'ghost'}
      size="sm"
      onClick={onClick}
      disabled={disabled}
      className="w-full shrink-0 font-mono"
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

function parseLocal(value: string): Date | null {
  if (value.trim() === '') {
    return null
  }
  const ms = Date.parse(value)
  if (Number.isNaN(ms)) {
    return null
  }
  return new Date(ms)
}

function toLocalInputValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}
