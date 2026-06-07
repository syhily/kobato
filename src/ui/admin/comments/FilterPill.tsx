import { XIcon } from 'lucide-react'
import { useMemo, useState } from 'react'

import { DateFilterEditor, formatDateInput } from '@/ui/admin/comments/DateFilterEditor'
import { FILTER_FIELDS, STATUS_OPTIONS } from '@/ui/admin/comments/filter-constants'
import { TextFilterEditor } from '@/ui/admin/comments/TextFilterEditor'
import {
  DEFAULT_DATE_OPERATOR,
  DEFAULT_TEXT_OPERATOR,
  dateFilterLabel,
  parseDateFilter,
  parseTextFilter,
  textFilterLabel,
  type ActiveFilter,
  type FilterItem,
} from '@/ui/admin/comments/useCommentsController'
import { Combobox, ComboboxContent, ComboboxItem, ComboboxTrigger, ComboboxValue } from '@/ui/components/combobox'
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/components/popover'
import { cn } from '@/ui/lib/cn'

interface FilterPillProps {
  filter: ActiveFilter
  onRemove: () => void
  onValueChange: (value: string, label: string) => void
  pageItems: FilterItem[]
  authorItems: FilterItem[]
  onPageSearch: (query: string) => void
  onAuthorSearch: (query: string) => void
  isPagesPending?: boolean
  isAuthorsPending?: boolean
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

export function FilterPill({
  filter,
  onRemove,
  onValueChange,
  pageItems,
  authorItems,
  onPageSearch,
  onAuthorSearch,
  isPagesPending,
  isAuthorsPending,
}: FilterPillProps) {
  const fieldDef = FILTER_FIELDS.find((f) => f.key === filter.field)
  const fieldLabel = fieldDef?.label ?? filter.field
  const FieldIcon = fieldDef?.icon

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
