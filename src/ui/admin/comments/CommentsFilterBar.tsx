import { ArrowLeftIcon, FunnelIcon, FunnelPlusIcon, SearchIcon, XIcon } from 'lucide-react'
import { useMemo, useState } from 'react'

import type { ActiveFilter, FilterFieldKey, FilterItem } from '@/ui/admin/comments/useCommentsController'

import { Combobox, ComboboxContent, ComboboxItem, ComboboxTrigger, ComboboxValue } from '@/ui/components/combobox'
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/components/popover'
import { cn } from '@/ui/lib/cn'

// Ghost-style filter field definitions
const FILTER_FIELDS: { key: FilterFieldKey; label: string }[] = [
  { key: 'status', label: '状态' },
  { key: 'page', label: '文章' },
  { key: 'author', label: '评论人' },
  { key: 'text', label: '内容' },
  { key: 'date', label: '时间' },
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

// Ghost's two-step "Add filter" popover:
// Step 1: searchable field list
// Step 2: value picker for the selected field
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
  const [fieldSearch, setFieldSearch] = useState('')

  const hasFilters = filters.length > 0

  const availableFields = useMemo(
    () => FILTER_FIELDS.filter((f) => !filters.some((active) => active.field === f.key)),
    [filters],
  )

  const filteredFields = useMemo(() => {
    if (!fieldSearch) {
      return availableFields
    }
    const q = fieldSearch.toLowerCase()
    return availableFields.filter((f) => f.label.toLowerCase().includes(q))
  }, [availableFields, fieldSearch])

  const resetPopover = () => {
    setSelectedField(null)
    setFieldSearch('')
  }

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
          <div className="flex flex-col">
            <div className="flex items-center gap-2 border-b px-3 py-2">
              <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
              <input
                aria-label="搜索筛选字段"
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                placeholder="搜索筛选字段…"
                value={fieldSearch}
                onChange={(e) => setFieldSearch(e.target.value)}
              />
            </div>
            <div className="max-h-60 overflow-y-auto p-1">
              {filteredFields.length === 0 ? (
                <p className="px-2 py-1.5 text-sm text-muted-foreground">无匹配字段</p>
              ) : (
                filteredFields.map((field) => (
                  <button
                    key={field.key}
                    type="button"
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition hover:bg-accent hover:text-accent-foreground"
                    onClick={() => setSelectedField(field.key)}
                  >
                    {field.label}
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

// Value picker panel shown after selecting a field in the add-filter popover.
// Matches Ghost's sub-picker: header with back button + field label, then value input.
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

  // Text: text input that submits on Enter
  if (field === 'text') {
    return <TextValuePicker label={fieldLabel} onBack={onBack} onSelect={onSelect} />
  }

  // Date: date input that submits on change
  if (field === 'date') {
    return <DateValuePicker label={fieldLabel} onBack={onBack} onSelect={onSelect} />
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

// Text input picker for the "内容" filter. Submits on Enter or blur.
function TextValuePicker({
  label,
  onBack,
  onSelect,
}: {
  label: string
  onBack: () => void
  onSelect: (value: string, label: string) => void
}) {
  const [value, setValue] = useState('')

  const submit = () => {
    const trimmed = value.trim()
    if (trimmed) {
      onSelect(trimmed, `包含「${trimmed.length > 8 ? `${trimmed.slice(0, 8)}…` : trimmed}」`)
    }
  }

  return (
    <div className="flex flex-col">
      <PickerHeader label={label} onBack={onBack} />
      <div className="p-2">
        <input
          aria-label="搜索评论内容"
          className="w-full rounded-md border border-border bg-transparent px-3 py-1.5 text-sm outline-none placeholder:text-muted-foreground focus:border-ring"
          placeholder="搜索评论内容…"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              submit()
            }
          }}
          onBlur={() => {
            submit()
          }}
        />
      </div>
    </div>
  )
}

// Date picker for the "时间" filter. Uses native date input for simplicity.
function DateValuePicker({
  label,
  onBack,
  onSelect,
}: {
  label: string
  onBack: () => void
  onSelect: (value: string, label: string) => void
}) {
  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="flex flex-col">
      <PickerHeader label={label} onBack={onBack} />
      <div className="flex flex-col gap-2 p-2">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">起始日期</span>
          <input
            aria-label="起始日期"
            type="date"
            max={today}
            className="w-full rounded-md border border-border bg-transparent px-3 py-1.5 text-sm outline-none focus:border-ring"
            onChange={(e) => {
              const after = e.target.value
              if (after) {
                const afterISO = new Date(after).toISOString()
                onSelect(afterISO, `${after} 之后`)
              }
            }}
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">结束日期</span>
          <input
            aria-label="结束日期"
            type="date"
            max={today}
            className="w-full rounded-md border border-border bg-transparent px-3 py-1.5 text-sm outline-none focus:border-ring"
            onChange={(e) => {
              const before = e.target.value
              if (before) {
                // End of day
                const beforeDate = new Date(before)
                beforeDate.setHours(23, 59, 59, 999)
                const beforeISO = beforeDate.toISOString()
                onSelect(beforeISO, `${before} 之前`)
              }
            }}
          />
        </div>
      </div>
    </div>
  )
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
  const fieldLabel = FILTER_FIELDS.find((f) => f.key === filter.field)?.label ?? filter.field

  // Text and date pills are read-only (no inline picker — just display + remove)
  const isReadOnly = filter.field === 'text' || filter.field === 'date'

  return (
    <div className="flex items-center">
      <div className="flex h-9 shrink-0 items-center gap-1.5 rounded-l-md border border-r-0 border-border bg-background px-3 text-sm text-foreground">
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
        ) : isReadOnly ? (
          <span className="flex h-full items-center px-3 text-sm text-foreground">{filter.label}</span>
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
