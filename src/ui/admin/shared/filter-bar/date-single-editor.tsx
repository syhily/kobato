import { CalendarIcon, CheckIcon, ChevronDownIcon } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'

import {
  DEFAULT_SINGLE_DATE_OPERATOR,
  SINGLE_DATE_FILTER_OPERATORS,
  type SingleDateFilterOperator,
  type SingleDateFilterValue,
} from '@/ui/admin/shared/date-filter'
import { Calendar } from '@/ui/components/calendar'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/ui/components/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/components/popover'
import { cn } from '@/ui/lib/cn'

export function parseDateInput(value: string): Date | undefined {
  if (!value) {
    return undefined
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) {
    return undefined
  }
  const [, yearPart, monthPart, dayPart] = match
  const year = Number(yearPart)
  const month = Number(monthPart)
  const day = Number(dayPart)
  const date = new Date(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return undefined
  }
  return date
}

export function formatDateInput(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function DateOperatorTrigger({
  value,
  onChange,
  className,
}: {
  value: SingleDateFilterOperator
  onChange: (op: SingleDateFilterOperator) => void
  className?: string
}) {
  const currentLabel = SINGLE_DATE_FILTER_OPERATORS.find((o) => o.value === value)?.label ?? value
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'flex h-9 w-full cursor-pointer items-center justify-between gap-1 px-3 text-sm transition',
          'hover:bg-accent focus-visible:shadow-focus focus-visible:outline-none',
          className,
        )}
      >
        {currentLabel}
        <ChevronDownIcon className="size-3.5 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-32">
        {SINGLE_DATE_FILTER_OPERATORS.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onClick={() => onChange(option.value)}
            className="flex items-center justify-between"
          >
            <span>{option.label}</span>
            {option.value === value && <CheckIcon className="size-3.5 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

interface DateSingleFilterEditorProps {
  value: SingleDateFilterValue | null
  onChange: (next: SingleDateFilterValue | null) => void
}

export function DateSingleFilterEditor({ value, onChange }: DateSingleFilterEditorProps) {
  const op = value?.op ?? DEFAULT_SINGLE_DATE_OPERATOR
  const [localDate, setLocalDate] = useState(value?.date ?? '')
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [isFocused, setIsFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const [lastCommitted, setLastCommitted] = useState(value?.date ?? '')
  // Sync local date when the external value changes — but only while unfocused, so in-flight edits survive.
  if ((value?.date ?? '') !== lastCommitted) {
    setLastCommitted(value?.date ?? '')
    if (!isFocused) {
      setLocalDate(value?.date ?? '')
    }
  }

  const parsedDate = useMemo(() => parseDateInput(localDate), [localDate])
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => parsedDate ?? new Date())
  const [lastParsedDate, setLastParsedDate] = useState(parsedDate)
  if (parsedDate !== lastParsedDate) {
    setLastParsedDate(parsedDate)
    if (parsedDate) {
      setCalendarMonth(parsedDate)
    }
  }

  const commitDate = (date: Date) => {
    const formatted = formatDateInput(date)
    setLocalDate(formatted)
    setLastCommitted(formatted)
    onChange({ date: formatted, op })
  }

  const handleBlur = () => {
    if (!localDate) {
      // Cleared input: commit the empty date — `parseSingleDateFilter` rejects it,
      // so the pill's query patch drops its bounds instead of silently keeping the old date.
      setLastCommitted('')
      onChange({ date: '', op })
    } else if (!parsedDate) {
      // Garbage input: restore the last committed value instead of inventing a date.
      setLocalDate(lastCommitted)
    } else {
      commitDate(parsedDate)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && parsedDate) {
      commitDate(parsedDate)
    }
  }

  const handleCalendarSelect = (date: Date | undefined) => {
    if (!date) {
      return
    }
    commitDate(date)
    setCalendarOpen(false)
  }

  const handleOperatorChange = (nextOp: SingleDateFilterOperator) => {
    const date = value?.date ?? (parsedDate ? formatDateInput(parsedDate) : '')
    onChange({ date, op: nextOp })
  }

  return (
    <div className="flex h-full w-full items-stretch">
      <DateOperatorTrigger value={op} onChange={handleOperatorChange} className="border-r border-border" />
      <div className="flex flex-1 items-stretch">
        <input
          ref={inputRef}
          aria-label="日期"
          autoComplete="off"
          inputMode="numeric"
          pattern="\d{4}-\d{2}-\d{2}"
          placeholder="YYYY-MM-DD"
          type="text"
          value={localDate}
          onChange={(e) => setLocalDate(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={handleBlur}
          onBlurCapture={() => setIsFocused(false)}
          onKeyDown={handleKeyDown}
          className="min-w-0 flex-1 bg-transparent px-2.5 text-sm outline-none placeholder:text-muted-foreground"
        />
        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <PopoverTrigger
            aria-label="打开日历"
            className="flex w-8 cursor-pointer items-center justify-center text-muted-foreground transition hover:text-foreground focus-visible:outline-none"
          >
            <CalendarIcon className="size-3.5" />
          </PopoverTrigger>
          <PopoverContent align="end" className="w-auto overflow-hidden p-0" sideOffset={4}>
            <Calendar
              mode="single"
              month={calendarMonth}
              selected={parsedDate}
              onMonthChange={setCalendarMonth}
              onSelect={handleCalendarSelect}
            />
          </PopoverContent>
        </Popover>
      </div>
    </div>
  )
}
