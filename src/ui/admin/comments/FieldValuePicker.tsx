import { ArrowLeftIcon } from 'lucide-react'

import type { FieldDefinition } from '@/ui/admin/comments/filter-constants'
import type { FilterFieldKey, FilterItem } from '@/ui/admin/comments/useCommentsController'

import { FILTER_FIELDS, STATUS_OPTIONS } from '@/ui/admin/comments/filter-constants'
import { InlineSearchableList } from '@/ui/admin/comments/InlineSearchableList'

interface PickerHeaderProps {
  label: string
  onBack: () => void
}

function PickerHeader({ label, onBack }: PickerHeaderProps) {
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

interface FieldValuePickerProps {
  field: FilterFieldKey
  onBack: () => void
  onSelect: (value: string, label: string) => void
  pageItems: FilterItem[]
  authorItems: FilterItem[]
  onPageSearch: (query: string) => void
  onAuthorSearch: (query: string) => void
  isPagesPending?: boolean
  isAuthorsPending?: boolean
  fields?: FieldDefinition[]
  statusOptions?: { value: string; label: string }[]
}

export function FieldValuePicker({
  field,
  onBack,
  onSelect,
  pageItems,
  authorItems,
  onPageSearch,
  onAuthorSearch,
  isPagesPending,
  isAuthorsPending,
  fields = FILTER_FIELDS,
  statusOptions = STATUS_OPTIONS,
}: FieldValuePickerProps) {
  const fieldDef = fields.find((f) => f.key === field)
  const fieldLabel = fieldDef?.label ?? field

  if (field === 'status') {
    return (
      <div className="flex flex-col">
        <PickerHeader label={fieldLabel} onBack={onBack} />
        <div className="p-1">
          {statusOptions.map((option) => (
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
