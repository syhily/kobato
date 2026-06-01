import type { ComponentType, SVGProps } from 'react'

import {
  ArrowLeftIcon,
  CalendarIcon,
  CheckIcon,
  ChevronDownIcon,
  FileTextIcon,
  FunnelIcon,
  FunnelPlusIcon,
  ListChecksIcon,
  SearchIcon,
  UserIcon,
  XIcon,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import {
  DATE_FILTER_OPERATORS,
  DEFAULT_DATE_OPERATOR,
  DEFAULT_TEXT_OPERATOR,
  dateFilterLabel,
  parseDateFilter,
  parseTextFilter,
  TEXT_FILTER_OPERATORS,
  textFilterLabel,
  type ActiveFilter,
  type DateFilterValue,
  type DateFilterOperator,
  type FilterFieldKey,
  type FilterItem,
  type TextFilterOperator,
  type TextFilterValue,
} from '@/ui/admin/comments/useCommentsController'
import { Calendar } from '@/ui/components/calendar'
import { Combobox, ComboboxContent, ComboboxItem, ComboboxTrigger, ComboboxValue } from '@/ui/components/combobox'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/ui/components/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/components/popover'
import { cn } from '@/ui/lib/cn'

type FieldIcon = ComponentType<SVGProps<SVGSVGElement>>

// Ghost-style filter field definitions. `icon` renders next to the
// label in the add-filter popover and in the active-filter chip.
const FILTER_FIELDS: { key: FilterFieldKey; label: string; icon: FieldIcon }[] = [
  { key: 'status', label: '状态', icon: ListChecksIcon },
  { key: 'page', label: '文章', icon: FileTextIcon },
  { key: 'author', label: '评论人', icon: UserIcon },
  { key: 'text', label: '内容', icon: SearchIcon },
  { key: 'date', label: '时间', icon: CalendarIcon },
]

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'pending', label: '待审核' },
  { value: 'approved', label: '已审核' },
]

interface CommentsFilterBarProps {
  filters: ActiveFilter[]
  onAddFilter: (field: FilterFieldKey, value: string, label: string) => void
  onRemoveFilter: (field: FilterFieldKey) => void
  onClearFilters: () => void
  pageItems: FilterItem[]
  authorItems: FilterItem[]
  onPageSearch: (query: string) => void
  onAuthorSearch: (query: string) => void
  isPagesPending?: boolean
  isAuthorsPending?: boolean
}

export function CommentsFilterBar({
  filters,
  onAddFilter,
  onRemoveFilter,
  onClearFilters,
  pageItems,
  authorItems,
  onPageSearch,
  onAuthorSearch,
  isPagesPending,
  isAuthorsPending,
}: CommentsFilterBarProps) {
  const hasFilters = filters.length > 0

  if (!hasFilters) {
    return (
      <FilterAddButton
        filters={filters}
        onAddFilter={onAddFilter}
        pageItems={pageItems}
        authorItems={authorItems}
        onPageSearch={onPageSearch}
        onAuthorSearch={onAuthorSearch}
        isPagesPending={isPagesPending}
        isAuthorsPending={isAuthorsPending}
      />
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      {filters.map((filter) => (
        <FilterPill
          key={filter.field}
          filter={filter}
          onRemove={() => onRemoveFilter(filter.field)}
          onValueChange={(value, label) => onAddFilter(filter.field, value, label)}
          pageItems={pageItems}
          authorItems={authorItems}
          onPageSearch={onPageSearch}
          onAuthorSearch={onAuthorSearch}
          isPagesPending={isPagesPending}
          isAuthorsPending={isAuthorsPending}
        />
      ))}
      <FilterAddButton
        filters={filters}
        onAddFilter={onAddFilter}
        pageItems={pageItems}
        authorItems={authorItems}
        onPageSearch={onPageSearch}
        onAuthorSearch={onAuthorSearch}
        isPagesPending={isPagesPending}
        isAuthorsPending={isAuthorsPending}
      />
      <button
        type="button"
        className="inline-flex shrink-0 items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground"
        onClick={onClearFilters}
      >
        <XIcon className="size-3.5" />
        清除
      </button>
    </div>
  )
}

// Ghost's "Add filter" popover: clicking a field in the list either
// adds a chip in one step (text/date, since the chip itself is the
// editor) or opens a sub-picker for fields that need an initial
// value (status/page/author).
function FilterAddButton({
  filters,
  onAddFilter,
  pageItems,
  authorItems,
  onPageSearch,
  onAuthorSearch,
  isPagesPending,
  isAuthorsPending,
}: {
  filters: ActiveFilter[]
  onAddFilter: (field: FilterFieldKey, value: string, label: string) => void
  pageItems: FilterItem[]
  authorItems: FilterItem[]
  onPageSearch: (query: string) => void
  onAuthorSearch: (query: string) => void
  isPagesPending?: boolean
  isAuthorsPending?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [selectedField, setSelectedField] = useState<FilterFieldKey | null>(null)

  const hasFilters = filters.length > 0

  const availableFields = useMemo(
    () => FILTER_FIELDS.filter((f) => !filters.some((active) => active.field === f.key)),
    [filters],
  )

  const resetPopover = () => {
    setSelectedField(null)
  }

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'f' || e.metaKey || e.ctrlKey || e.altKey) {
        return
      }
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return
      }
      e.preventDefault()
      setOpen(true)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (!nextOpen) {
      resetPopover()
    }
  }

  const handleAddAndClose = (field: FilterFieldKey, value: string, label: string) => {
    onAddFilter(field, value, label)
    setOpen(false)
    resetPopover()
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        className={cn(
          'inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-border px-3 text-sm transition hover:bg-accent',
          'focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none',
        )}
      >
        {hasFilters ? <FunnelPlusIcon className="size-4" /> : <FunnelIcon className="size-4" />}
        {hasFilters ? '添加筛选' : '筛选'}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-0">
        {selectedField ? (
          <FieldValuePicker
            field={selectedField}
            onBack={resetPopover}
            onSelect={(value, label) => handleAddAndClose(selectedField, value, label)}
            pageItems={pageItems}
            authorItems={authorItems}
            onPageSearch={onPageSearch}
            onAuthorSearch={onAuthorSearch}
            isPagesPending={isPagesPending}
            isAuthorsPending={isAuthorsPending}
          />
        ) : (
          <div className="max-h-60 overflow-y-auto p-1">
            {availableFields.length === 0 ? (
              <p className="px-2 py-1.5 text-sm text-muted-foreground">无匹配字段</p>
            ) : (
              availableFields.map((field) => {
                const Icon = field.icon
                return (
                  <button
                    key={field.key}
                    type="button"
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition hover:bg-accent hover:text-accent-foreground"
                    onClick={() => {
                      if (field.key === 'text') {
                        handleAddAndClose('text', JSON.stringify({ op: DEFAULT_TEXT_OPERATOR, value: '' }), '内容')
                        return
                      }
                      if (field.key === 'date') {
                        handleAddAndClose('date', JSON.stringify({ date: '', op: DEFAULT_DATE_OPERATOR }), '时间')
                        return
                      }
                      setSelectedField(field.key)
                    }}
                  >
                    <Icon className="size-4 shrink-0 text-muted-foreground" />
                    {field.label}
                  </button>
                )
              })
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

// Value picker panel shown after selecting a field in the add-filter popover.
// Matches Ghost's sub-picker: header with back button + field label, then value input.
// `text` and `date` are added in a single step from `FilterAddButton` (the chip
// itself is the editor), so this picker only hosts `status` / `page` / `author`.
function FieldValuePicker({
  field,
  onBack,
  onSelect,
  pageItems,
  authorItems,
  onPageSearch,
  onAuthorSearch,
  isPagesPending,
  isAuthorsPending,
}: {
  field: FilterFieldKey
  onBack: () => void
  onSelect: (value: string, label: string) => void
  pageItems: FilterItem[]
  authorItems: FilterItem[]
  onPageSearch: (query: string) => void
  onAuthorSearch: (query: string) => void
  isPagesPending?: boolean
  isAuthorsPending?: boolean
}) {
  const fieldLabel = FILTER_FIELDS.find((f) => f.key === field)?.label ?? field

  // Status: fixed option list
  if (field === 'status') {
    return (
      <div className="flex flex-col">
        <PickerHeader label={fieldLabel} onBack={onBack} />
        <div className="p-1">
          {STATUS_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition hover:bg-accent hover:text-accent-foreground"
              onClick={() => onSelect(option.value, option.label)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    )
  }

  // Page/Author: searchable select
  const items = field === 'page' ? pageItems : authorItems
  const searchFn = field === 'page' ? onPageSearch : onAuthorSearch
  const isPending = field === 'page' ? isPagesPending : isAuthorsPending
  const placeholder = field === 'page' ? '搜索文章…' : '搜索人员…'
  const emptyMessage = isPending ? '加载中…' : '无匹配结果'

  return (
    <div className="flex flex-col">
      <PickerHeader label={fieldLabel} onBack={onBack} />
      <div className="max-h-60 overflow-y-auto">
        <InlineSearchableList
          items={items}
          onSearch={searchFn}
          onSelect={onSelect}
          placeholder={placeholder}
          emptyMessage={emptyMessage}
        />
      </div>
    </div>
  )
}

function PickerHeader({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-2 border-b px-2 py-2">
      <button
        type="button"
        className="flex size-6 items-center justify-center rounded-sm text-muted-foreground transition hover:bg-accent hover:text-foreground"
        onClick={onBack}
      >
        <ArrowLeftIcon className="size-4" />
      </button>
      <span className="text-sm font-medium">{label}</span>
    </div>
  )
}

// Shared date-filter editor: operator dropdown + YYYY-MM-DD text
// input + calendar popover. Used by the inline pill — every change
// to `value` flows straight into the filter via `onValueChange`
// (no 应用 button).
//
// The wrapper is a single-row layout that matches the active-filter
// pill — operator trigger on the left, date input + calendar on the
// right, no gap between them, no outer borders (the pill's segment
// provides the border).
//
// The text input keeps a small local buffer so the segment-edit
// cursor stays intact across URL round-trips; commits fire on
// Enter / blur / calendar pick with a malformed-input fallback to
// today's date (matches Ghost's `FilterDatePicker`).
function DateFilterEditor({
  value,
  onChange,
}: {
  value: DateFilterValue | null
  onChange: (next: DateFilterValue | null) => void
}) {
  const op = value?.op ?? DEFAULT_DATE_OPERATOR
  const [localDate, setLocalDate] = useState(value?.date ?? '')
  const [calendarOpen, setCalendarOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const lastLocalCommitRef = useRef(value?.date ?? '')

  // Sync the input buffer from upstream changes (URL deep-link, chip
  // removal/clear, etc.) only when the user isn't actively editing.
  useEffect(() => {
    const committed = value?.date ?? ''
    if (committed === lastLocalCommitRef.current) {
      return
    }
    if (document.activeElement !== inputRef.current) {
      setLocalDate(committed)
      lastLocalCommitRef.current = committed
    }
  }, [value])

  const parsedDate = useMemo(() => parseDateInput(localDate), [localDate])
  // Track the visible calendar month in state so the left/right
  // navigation buttons actually move the grid. Computing it
  // directly from `parsedDate` would make `month` a controlled
  // prop that resets to the typed date on every render — the
  // navigation would visually flicker and then snap back.
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => parsedDate ?? new Date())
  useEffect(() => {
    if (parsedDate) {
      setCalendarMonth(parsedDate)
    }
  }, [parsedDate])

  const commitDate = (date: Date) => {
    const formatted = formatDateInput(date)
    setLocalDate(formatted)
    lastLocalCommitRef.current = formatted
    onChange({ date: formatted, op })
  }

  const handleBlur = () => {
    if (localDate && !parsedDate) {
      // Partial / malformed input — fall back to today so the buffer
      // doesn't strand an unparseable string (matches Ghost).
      commitDate(new Date())
    } else if (parsedDate) {
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

  const handleOperatorChange = (nextOp: DateFilterOperator) => {
    // Prefer the committed date, then the parsed in-buffer date, then
    // empty. Operator change is a "commit now" — like blur — so we
    // don't want to silently drop an in-progress date the user has
    // typed but not yet blurred. An empty fallback is safe: the
    // bounds resolver returns no bounds for an invalid date, so the
    // server filter is a no-op until the user actually picks a date.
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
          onBlur={handleBlur}
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

// Operator dropdown trigger used inside the date filter editor.
// Bordered by default; pass a `className` to override (e.g. the
// inline pill uses a borderless look that blends into the pill's
// own borders).
function DateOperatorTrigger({
  value,
  onChange,
  className,
}: {
  value: DateFilterOperator
  onChange: (op: DateFilterOperator) => void
  className?: string
}) {
  const currentLabel = DATE_FILTER_OPERATORS.find((o) => o.value === value)?.label ?? value
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'flex h-9 w-full cursor-pointer items-center justify-between gap-1 px-3 text-sm transition',
          'hover:bg-accent focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none',
          className,
        )}
      >
        {currentLabel}
        <ChevronDownIcon className="size-3.5 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-32">
        {DATE_FILTER_OPERATORS.map((option) => (
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

// Inline text-filter editor: operator dropdown + free-text input.
// Always paired with a non-null `value` (the pill always provides
// one — single-step add sets a default `{ op, value: '' }`).
//
// Commit semantics:
//   - Enter / blur on the input → commit with the trimmed text
//     (preserves the operator, even when the value is empty, so
//     clearing the input doesn't reset the operator back to default).
//   - Operator change → commit immediately, keeping the current
//     text value intact.
//
// A small local buffer (`localValue` + `lastLocalCommitRef`) keeps
// the segment-edit cursor intact when the URL round-trip fires
// mid-edit (matches `DateFilterEditor`).
function TextFilterEditor({ value, onChange }: { value: TextFilterValue; onChange: (next: TextFilterValue) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [localValue, setLocalValue] = useState(value.value)
  const lastLocalCommitRef = useRef(value.value)

  // Sync the local buffer from upstream changes (URL deep-link,
  // chip removal/clear, etc.) only when the user isn't actively
  // editing.
  useEffect(() => {
    if (value.value === lastLocalCommitRef.current) {
      return
    }
    if (document.activeElement !== inputRef.current) {
      setLocalValue(value.value)
      lastLocalCommitRef.current = value.value
    }
  }, [value.value])

  const commit = (next: string) => {
    lastLocalCommitRef.current = next
    onChange({ op: value.op, value: next })
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      commit(localValue.trim())
    }
  }

  const handleBlur = () => {
    commit(localValue.trim())
  }

  const handleOperatorChange = (nextOp: TextFilterOperator) => {
    onChange({ op: nextOp, value: value.value })
  }

  return (
    <div className="flex h-full w-full items-stretch">
      <TextOperatorTrigger value={value.op} onChange={handleOperatorChange} className="border-r border-border" />
      <div className="flex flex-1 items-stretch">
        <input
          ref={inputRef}
          aria-label="搜索评论内容"
          autoComplete="off"
          placeholder="搜索评论内容…"
          type="text"
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className="min-w-0 flex-1 bg-transparent px-2.5 text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
    </div>
  )
}

// Operator dropdown trigger for the text filter (包含 / 不包含).
// Mirrors `DateOperatorTrigger` so the two filter chips share the
// same visual rhythm inside the pill.
function TextOperatorTrigger({
  value,
  onChange,
  className,
}: {
  value: TextFilterOperator
  onChange: (op: TextFilterOperator) => void
  className?: string
}) {
  const currentLabel = TEXT_FILTER_OPERATORS.find((o) => o.value === value)?.label ?? value
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'flex h-9 w-full cursor-pointer items-center justify-between gap-1 px-3 text-sm transition',
          'hover:bg-accent focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none',
          className,
        )}
      >
        {currentLabel}
        <ChevronDownIcon className="size-3.5 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-32">
        {TEXT_FILTER_OPERATORS.map((option) => (
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

// Strict YYYY-MM-DD parser. Returns a local-time `Date` for
// well-formed, in-range inputs (e.g. 2026-02-30 is rejected because
// the round-trip through `new Date()` would silently roll it forward)
// and `undefined` for empty / malformed values. Ghost's
// `parseFilterDateValue` uses the same round-trip check.
function parseDateInput(value: string): Date | undefined {
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

function formatDateInput(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function InlineSearchableList({
  items,
  onSearch,
  onSelect,
  placeholder,
  emptyMessage,
}: {
  items: FilterItem[]
  onSearch: (query: string) => void
  onSelect: (value: string, label: string) => void
  placeholder: string
  emptyMessage: string
}) {
  const [query, setQuery] = useState('')

  const handleSearch = (value: string) => {
    setQuery(value)
    onSearch(value)
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
        <input
          aria-label="搜索"
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          placeholder={placeholder}
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
        />
      </div>
      <div className="p-1">
        {items.length === 0 ? (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">{emptyMessage}</p>
        ) : (
          items.map((item) => (
            <button
              key={item.value}
              type="button"
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition hover:bg-accent hover:text-accent-foreground"
              onClick={() => onSelect(item.value, item.label)}
            >
              {item.label}
            </button>
          ))
        )}
      </div>
    </div>
  )
}

// A single filter pill with 3 segments: label | value (clickable) | remove.
function FilterPill({
  filter,
  onRemove,
  onValueChange,
  pageItems,
  authorItems,
  onPageSearch,
  onAuthorSearch,
  isPagesPending,
  isAuthorsPending,
}: {
  filter: ActiveFilter
  onRemove: () => void
  onValueChange: (value: string, label: string) => void
  pageItems: FilterItem[]
  authorItems: FilterItem[]
  onPageSearch: (query: string) => void
  onAuthorSearch: (query: string) => void
  isPagesPending?: boolean
  isAuthorsPending?: boolean
}) {
  const fieldDef = FILTER_FIELDS.find((f) => f.key === filter.field)
  const fieldLabel = fieldDef?.label ?? filter.field
  const FieldIcon = fieldDef?.icon

  // Parse the date filter value once so the inline editor can mount
  // with the right operator/date. Falls back to the default operator
  // + today's date if the value is malformed (shouldn't happen in
  // practice — the URL hydration path validates with
  // `isDateFilterOperator`).
  const dateValue = useMemo(
    () =>
      filter.field === 'date'
        ? (parseDateFilter(filter.value) ?? {
            date: formatDateInput(new Date()),
            op: DEFAULT_DATE_OPERATOR,
          })
        : null,
    [filter.field, filter.value],
  )

  // Same fallback strategy for the text filter: malformed chip
  // values resolve to the default operator + empty string so the
  // pill always has a valid editor mount-point.
  const textValue = useMemo(
    () =>
      filter.field === 'text' ? (parseTextFilter(filter.value) ?? { op: DEFAULT_TEXT_OPERATOR, value: '' }) : null,
    [filter.field, filter.value],
  )

  return (
    <div className="flex items-center">
      <div className="flex h-9 shrink-0 items-center gap-1.5 rounded-l-md border border-r-0 border-border bg-background px-3 text-sm text-foreground">
        {FieldIcon && <FieldIcon className="size-3.5 text-muted-foreground" />}
        {fieldLabel}
      </div>
      <div className="flex h-9 items-center border border-r-0 border-border bg-background">
        {filter.field === 'status' ? (
          <StatusValuePicker value={filter.value} onChange={onValueChange} />
        ) : filter.field === 'page' ? (
          <ComboboxValuePicker
            items={pageItems}
            value={filter.value}
            label={filter.label}
            onValueChange={onValueChange}
            onSearch={onPageSearch}
            placeholder="全部文章"
            inputPlaceholder="搜索文章…"
            emptyMessage={isPagesPending ? '加载中…' : '无匹配文章'}
          />
        ) : filter.field === 'author' ? (
          <ComboboxValuePicker
            items={authorItems}
            value={filter.value}
            label={filter.label}
            onValueChange={onValueChange}
            onSearch={onAuthorSearch}
            placeholder="全部人员"
            inputPlaceholder="搜索人员…"
            emptyMessage={isAuthorsPending ? '加载中…' : '无匹配人员'}
          />
        ) : filter.field === 'date' && dateValue ? (
          <DateFilterEditor
            value={dateValue}
            onChange={(next) => {
              if (!next) {
                return
              }
              onValueChange(JSON.stringify(next), dateFilterLabel(next))
            }}
          />
        ) : filter.field === 'text' && textValue ? (
          <TextFilterEditor
            value={textValue}
            onChange={(next) => onValueChange(JSON.stringify(next), textFilterLabel(next))}
          />
        ) : null}
      </div>
      <button
        type="button"
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-r-md border border-l-0 border-border text-muted-foreground transition',
          'hover:bg-secondary hover:text-foreground',
          'focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none',
        )}
        onClick={onRemove}
      >
        <XIcon className="size-3.5" />
      </button>
    </div>
  )
}

function StatusValuePicker({ value, onChange }: { value: string; onChange: (value: string, label: string) => void }) {
  const currentLabel = STATUS_OPTIONS.find((o) => o.value === value)?.label ?? value
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(
          'flex h-full cursor-pointer items-center gap-1 px-3 text-sm text-foreground transition',
          'hover:bg-secondary',
        )}
      >
        {currentLabel}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-32 p-1">
        {STATUS_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition hover:bg-accent hover:text-accent-foreground"
            onClick={() => {
              onChange(option.value, option.label)
              setOpen(false)
            }}
          >
            {option.label}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}

function ComboboxValuePicker({
  items,
  value,
  label,
  onValueChange,
  onSearch,
  placeholder,
  inputPlaceholder,
  emptyMessage,
}: {
  items: FilterItem[]
  value: string
  label: string
  onValueChange: (value: string, label: string) => void
  onSearch: (query: string) => void
  placeholder: string
  inputPlaceholder: string
  emptyMessage: string
}) {
  return (
    <Combobox<FilterItem>
      items={items}
      value={{ value, label }}
      onValueChange={(item) => {
        if (item) {
          onValueChange(item.value, item.label)
        }
      }}
      inputValue=""
      onInputValueChange={onSearch}
      filter={null}
    >
      <ComboboxTrigger className="h-full border-0 px-3 shadow-none data-[popup-open]:ring-0">
        <ComboboxValue placeholder={placeholder} />
      </ComboboxTrigger>
      <ComboboxContent<FilterItem> inputPlaceholder={inputPlaceholder} emptyMessage={emptyMessage}>
        {(item) => (
          <ComboboxItem key={item.value} value={item}>
            {item.label}
          </ComboboxItem>
        )}
      </ComboboxContent>
    </Combobox>
  )
}
