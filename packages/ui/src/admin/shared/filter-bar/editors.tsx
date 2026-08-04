import type { DateFilterValue } from '@kobato/ui/admin/shared/date-filter'
import type { TextFilterValue } from '@kobato/ui/admin/shared/filter-bar/text-filter'
import type {
  FilterOptionItem,
  OptionsFilterField,
  SearchFieldState,
  SearchFilterField,
  TextFilterField,
} from '@kobato/ui/admin/shared/filter-bar/types'

import { DateRangeCalendarPicker } from '@kobato/ui/admin/shared/DateRangePicker'
import { SearchableOptionList } from '@kobato/ui/admin/shared/filter-bar/option-list'
import { Combobox, ComboboxContent, ComboboxItem, ComboboxTrigger, ComboboxValue } from '@kobato/ui/components/combobox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@kobato/ui/components/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@kobato/ui/components/popover'
import { cn } from '@kobato/ui/lib/cn'
import { CheckIcon, ChevronDownIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

// Pill value editors — one per field `kind`. Each decodes nothing itself:
// `pill.tsx` hands them a codec-correct value and they report commits back
// as editor-level values; the pill owns serialization + labels.

/** Static options dropdown (comments status, audit action / resourceType /
 *  actor). Searchable sets render the locally-filtered list (w-56); plain
 *  sets render the compact option list (w-32). */
export function OptionsValueEditor<K extends string>({
  field,
  value,
  onChange,
}: {
  field: OptionsFilterField<K>
  value: string
  onChange: (value: string, label: string) => void
}) {
  const currentLabel = field.options.find((o) => o.value === value)?.label ?? value
  const [open, setOpen] = useState(false)

  const select = (option: FilterOptionItem) => {
    onChange(option.value, option.label)
    setOpen(false)
  }

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
      {field.searchable ? (
        <PopoverContent align="start" className="w-56 p-0">
          <SearchableOptionList
            options={field.options}
            selectedValue={value}
            onSelect={select}
            placeholder={field.searchPlaceholder}
            emptyMessage={field.searchEmptyMessage}
            renderOption={field.renderOption}
          />
        </PopoverContent>
      ) : (
        <PopoverContent align="start" className="w-32 p-1">
          {field.options.map((option) => (
            <button
              key={option.value}
              type="button"
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition hover:bg-accent hover:text-accent-foreground"
              onClick={() => select(option)}
            >
              {option.label}
            </button>
          ))}
        </PopoverContent>
      )}
    </Popover>
  )
}

/** Async combobox backed by the field's debounced server search (comments
 *  page / author, my-comments entity). */
export function SearchComboboxEditor<K extends string>({
  field,
  value,
  label,
  state,
  onChange,
}: {
  field: SearchFilterField<K>
  value: string
  label: string
  state: SearchFieldState
  onChange: (value: string, label: string) => void
}) {
  const [inputValue, setInputValue] = useState('')

  return (
    <Combobox<FilterOptionItem>
      items={state.items}
      value={{ value, label }}
      onValueChange={(item) => {
        setInputValue('')
        if (item) {
          onChange(item.value, item.label)
        }
      }}
      inputValue={inputValue}
      onInputValueChange={(nextValue) => {
        setInputValue(nextValue)
        state.setQuery(nextValue)
      }}
      filter={null}
    >
      <ComboboxTrigger className="h-full border-0 px-3 shadow-none data-[popup-open]:ring-0">
        <ComboboxValue placeholder={field.placeholder} />
      </ComboboxTrigger>
      <ComboboxContent<FilterOptionItem>
        inputPlaceholder={field.inputPlaceholder}
        emptyMessage={state.isPending ? '加载中…' : (field.emptyMessage ?? '无匹配结果')}
      >
        {(item) => (
          <ComboboxItem key={item.value} value={item}>
            {field.renderOption ? field.renderOption(item, item.value === value) : item.label}
          </ComboboxItem>
        )}
      </ComboboxContent>
    </Combobox>
  )
}

function TextOperatorTrigger({
  value,
  onChange,
  operators,
  className,
}: {
  value: string
  onChange: (op: string) => void
  operators: readonly { value: string; label: string }[]
  className?: string
}) {
  const currentLabel = operators.find((o) => o.value === value)?.label ?? value
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
        {operators.map((option) => (
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

/** Operator dropdown + free text, committed on blur / Enter (内容). */
export function TextFilterEditor<K extends string>({
  field,
  value,
  onChange,
}: {
  field: TextFilterField<K>
  value: TextFilterValue
  onChange: (next: TextFilterValue) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [localValue, setLocalValue] = useState(value.value)
  const lastLocalCommitRef = useRef(value.value)

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

  const handleOperatorChange = (nextOp: string) => {
    onChange({ op: nextOp, value: value.value })
  }

  const showOperator = field.operators.length > 1

  return (
    <div className="flex h-full w-full items-stretch">
      {showOperator && (
        <TextOperatorTrigger
          value={value.op}
          onChange={handleOperatorChange}
          operators={field.operators}
          className="border-r border-border"
        />
      )}
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

/** Bare blur-commit input (audit IP). */
export function FreetextEditor({
  value,
  placeholder,
  onCommit,
}: {
  value: string
  placeholder: string
  onCommit: (value: string) => void
}) {
  const [draft, setDraft] = useState(value)

  const commit = () => {
    const trimmed = draft.trim()
    if (trimmed !== value) {
      onCommit(trimmed)
    }
  }

  return (
    <input
      type="text"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          commit()
        }
      }}
      placeholder={placeholder}
      className="h-9 min-w-0 flex-1 bg-transparent px-2.5 text-sm outline-none placeholder:text-muted-foreground"
    />
  )
}

/** From/to range picker (audit 时间). */
export function DateRangeEditor({
  value,
  onChange,
}: {
  value: DateFilterValue
  onChange: (next: DateFilterValue) => void
}) {
  return (
    <div className="flex h-full items-center px-2">
      <DateRangeCalendarPicker from={value.from} to={value.to} onChange={(from, to) => onChange({ from, to })} />
    </div>
  )
}
