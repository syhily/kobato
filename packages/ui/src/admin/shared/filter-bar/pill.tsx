import type { FilterFieldSpec, SearchFieldState } from '@kobato/ui/admin/shared/filter-bar/types'
import type { ActiveFilter } from '@kobato/ui/admin/shared/filterPillsReducer'

import {
  DEFAULT_SINGLE_DATE_OPERATOR,
  dateFilterLabel,
  parseDateFilter,
  parseSingleDateFilter,
  singleDateFilterLabel,
} from '@kobato/ui/admin/shared/date-filter'
import { DateSingleFilterEditor, formatDateInput } from '@kobato/ui/admin/shared/filter-bar/date-single-editor'
import {
  DateRangeEditor,
  FreetextEditor,
  OptionsValueEditor,
  SearchComboboxEditor,
  TextFilterEditor,
} from '@kobato/ui/admin/shared/filter-bar/editors'
import { parseTextFilterValue, textFilterValueLabel } from '@kobato/ui/admin/shared/filter-bar/text-filter'
import { cn } from '@kobato/ui/lib/cn'
import { XIcon } from 'lucide-react'
import { useMemo } from 'react'

// One filter pill: the field label + icon on the left, the kind-specific
// value editor in the middle, and the remove (×) button on the right. Pill
// values are opaque strings at the interface — this component owns decoding
// (with a never-throwing fallback to the editor default) and re-serialization.

interface FilterPillProps<K extends string> {
  field: FilterFieldSpec<K> | undefined
  filter: ActiveFilter<K>
  search: Partial<Record<K, SearchFieldState>>
  onRemove: () => void
  onValueChange: (value: string, label: string) => void
}

export function FilterPill<K extends string>({ field, filter, search, onRemove, onValueChange }: FilterPillProps<K>) {
  const fieldLabel = field?.label ?? filter.field
  const FieldIcon = field?.icon

  // Malformed JSON falls back to the editor default, never throws.
  const dateSingleValue = useMemo(
    () =>
      field?.kind === 'date-single'
        ? (parseSingleDateFilter(filter.value) ?? {
            date: formatDateInput(new Date()),
            op: DEFAULT_SINGLE_DATE_OPERATOR,
          })
        : null,
    [field, filter.value],
  )
  const dateRangeValue = useMemo(
    () => (field?.kind === 'date-range' ? (parseDateFilter(filter.value) ?? { from: '', to: '' }) : null),
    [field, filter.value],
  )
  const textValue = useMemo(
    () =>
      field?.kind === 'text'
        ? (parseTextFilterValue(filter.value, field.operators) ?? {
            op: field.operators[0]?.value ?? '',
            value: '',
          })
        : null,
    [field, filter.value],
  )

  const searchState = field?.kind === 'search' ? search[field.key] : undefined

  return (
    <div className="flex items-center">
      <div className="flex h-9 shrink-0 items-center gap-1.5 rounded-l-md border border-r-0 border-border bg-background px-3 text-sm text-foreground">
        {FieldIcon && <FieldIcon className="size-3.5 text-muted-foreground" />}
        {fieldLabel}
      </div>
      <div className="flex h-9 items-center border border-r-0 border-border bg-background">
        {!field ? null : field.kind === 'options' ? (
          <OptionsValueEditor field={field} value={filter.value} onChange={onValueChange} />
        ) : field.kind === 'search' && searchState ? (
          <SearchComboboxEditor
            field={field}
            value={filter.value}
            label={filter.label}
            state={searchState}
            onChange={onValueChange}
          />
        ) : field.kind === 'text' && textValue ? (
          <TextFilterEditor
            field={field}
            value={textValue}
            onChange={(next) => onValueChange(JSON.stringify(next), textFilterValueLabel(next, field.operators))}
          />
        ) : field.kind === 'freetext' ? (
          <FreetextEditor
            value={filter.value}
            placeholder={field.placeholder}
            onCommit={(next) => onValueChange(next, next || field.label)}
          />
        ) : field.kind === 'date-single' && dateSingleValue ? (
          <DateSingleFilterEditor
            value={dateSingleValue}
            onChange={(next) => {
              if (!next) {
                return
              }
              onValueChange(JSON.stringify(next), singleDateFilterLabel(next))
            }}
          />
        ) : field.kind === 'date-range' && dateRangeValue ? (
          <DateRangeEditor
            value={dateRangeValue}
            onChange={(next) => onValueChange(JSON.stringify(next), dateFilterLabel(next))}
          />
        ) : null}
      </div>
      <button
        type="button"
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-r-md border border-l-0 border-border text-muted-foreground transition',
          'hover:bg-secondary hover:text-foreground',
          'focus-visible:shadow-focus focus-visible:outline-none',
        )}
        onClick={onRemove}
      >
        <XIcon className="size-3.5" />
      </button>
    </div>
  )
}
