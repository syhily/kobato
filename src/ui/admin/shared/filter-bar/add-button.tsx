import { ArrowLeftIcon, FunnelIcon, FunnelPlusIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import type { FilterFieldSpec, SearchFieldState } from '@/ui/admin/shared/filter-bar/types'
import type { ActiveFilter } from '@/ui/admin/shared/filterPillsReducer'

import { DEFAULT_SINGLE_DATE_OPERATOR } from '@/ui/admin/shared/date-filter'
import { InlineSearchList, SearchableOptionList } from '@/ui/admin/shared/filter-bar/option-list'
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/components/popover'
import { cn } from '@/ui/lib/cn'

// The 筛选 / 添加筛选 trigger — text/freetext/date kinds instant-add a default pill,
// option/search open a picker step; global `f` opens it except on text-entry surfaces.
interface FilterAddButtonProps<K extends string> {
  fields: readonly FilterFieldSpec<K>[]
  filters: ActiveFilter<K>[]
  search: Partial<Record<K, SearchFieldState>>
  onAddFilter: (field: K, value: string, label: string) => void
}

export function FilterAddButton<K extends string>({ fields, filters, search, onAddFilter }: FilterAddButtonProps<K>) {
  const [open, setOpen] = useState(false)
  const [selectedField, setSelectedField] = useState<K | null>(null)

  const hasFilters = filters.length > 0

  const availableFields = useMemo(
    () => fields.filter((f) => !filters.some((active) => active.field === f.key)),
    [fields, filters],
  )

  const resetPopover = () => {
    setSelectedField(null)
  }

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'f' || e.metaKey || e.ctrlKey || e.altKey) {
        return
      }
      const target = e.target instanceof HTMLElement ? e.target : null
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

  const handleAddAndClose = (field: K, value: string, label: string) => {
    onAddFilter(field, value, label)
    setOpen(false)
    resetPopover()
  }

  const handleFieldSelect = (field: FilterFieldSpec<K>) => {
    switch (field.kind) {
      case 'text':
        handleAddAndClose(field.key, JSON.stringify({ op: field.operators[0]?.value ?? '', value: '' }), field.label)
        return
      case 'freetext':
        handleAddAndClose(field.key, '', field.label)
        return
      case 'date-single':
        handleAddAndClose(field.key, JSON.stringify({ date: '', op: DEFAULT_SINGLE_DATE_OPERATOR }), field.label)
        return
      case 'date-range':
        handleAddAndClose(field.key, JSON.stringify({ from: '', to: '' }), field.label)
        return
      case 'options':
      case 'search':
        setSelectedField(field.key)
    }
  }

  const selectedFieldSpec = selectedField ? fields.find((f) => f.key === selectedField) : undefined

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        className={cn(
          'inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-border px-3 text-sm transition hover:bg-accent',
          'focus-visible:shadow-focus focus-visible:outline-none',
        )}
      >
        {hasFilters ? <FunnelPlusIcon className="size-4" /> : <FunnelIcon className="size-4" />}
        {hasFilters ? '添加筛选' : '筛选'}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-0">
        {selectedFieldSpec ? (
          <PickerStep
            field={selectedFieldSpec}
            search={search}
            onBack={resetPopover}
            onSelect={(value, label) => handleAddAndClose(selectedFieldSpec.key, value, label)}
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
                    onClick={() => handleFieldSelect(field)}
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

function PickerStep<K extends string>({
  field,
  search,
  onBack,
  onSelect,
}: {
  field: FilterFieldSpec<K>
  search: Partial<Record<K, SearchFieldState>>
  onBack: () => void
  onSelect: (value: string, label: string) => void
}) {
  if (field.kind === 'options') {
    return (
      <div className="flex flex-col">
        <PickerHeader label={field.label} onBack={onBack} />
        {field.searchable ? (
          <SearchableOptionList
            options={field.options}
            onSelect={(option) => onSelect(option.value, option.label)}
            placeholder={field.searchPlaceholder}
            emptyMessage={field.searchEmptyMessage}
            renderOption={field.renderOption}
          />
        ) : (
          <div className="p-1">
            {field.options.map((option) => (
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
        )}
      </div>
    )
  }

  if (field.kind === 'search') {
    const state = search[field.key]
    return (
      <div className="flex flex-col">
        <PickerHeader label={field.label} onBack={onBack} />
        <div className="max-h-60 overflow-y-auto">
          <InlineSearchList
            items={state?.items ?? []}
            onSearch={(query) => state?.setQuery(query)}
            onSelect={onSelect}
            placeholder={field.inputPlaceholder}
            emptyMessage={state?.isPending ? '加载中…' : '无匹配结果'}
          />
        </div>
      </div>
    )
  }

  return null
}
