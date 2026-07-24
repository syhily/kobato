import { FunnelIcon, FunnelPlusIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { FieldValuePicker } from '@/ui/admin/comments/FieldValuePicker'
import { type FieldDefinition, FILTER_FIELDS, STATUS_OPTIONS } from '@/ui/admin/comments/filter-constants'
import {
  DEFAULT_TEXT_OPERATOR,
  type ActiveFilter,
  type FilterFieldKey,
  type FilterItem,
} from '@/ui/admin/comments/useCommentsController'
import { DEFAULT_SINGLE_DATE_OPERATOR } from '@/ui/admin/shared/date-filter'
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/components/popover'
import { cn } from '@/ui/lib/cn'

interface FilterAddButtonProps {
  filters: ActiveFilter[]
  onAddFilter: (field: FilterFieldKey, value: string, label: string) => void
  pageItems: FilterItem[]
  authorItems: FilterItem[]
  onPageSearch: (query: string) => void
  onAuthorSearch: (query: string) => void
  isPagesPending?: boolean
  isAuthorsPending?: boolean
  fields?: FieldDefinition[]
  statusOptions?: { value: string; label: string }[]
}

export function FilterAddButton({
  filters,
  onAddFilter,
  pageItems,
  authorItems,
  onPageSearch,
  onAuthorSearch,
  isPagesPending,
  isAuthorsPending,
  fields = FILTER_FIELDS,
  statusOptions = STATUS_OPTIONS,
}: FilterAddButtonProps) {
  const [open, setOpen] = useState(false)
  const [selectedField, setSelectedField] = useState<FilterFieldKey | null>(null)

  const hasFilters = filters.length > 0

  const availableFields = useMemo(
    () => fields.filter((f) => !filters.some((active) => active.field === f.key)),
    [filters, fields],
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
          'focus-visible:shadow-focus focus-visible:outline-none',
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
            fields={fields}
            statusOptions={statusOptions}
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
                        handleAddAndClose(
                          'date',
                          JSON.stringify({ date: '', op: DEFAULT_SINGLE_DATE_OPERATOR }),
                          '时间',
                        )
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
