import { ArrowLeftIcon, FunnelIcon, FunnelPlusIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import type { AuditLogActorDto } from '@/shared/types/audit'
import type { ActiveFilter, AuditLogFilterFieldKey } from '@/ui/admin/audit/useAuditLogController'

import { AuditLogActorPicker } from '@/ui/admin/audit/AuditLogActorPicker'
import { ACTION_OPTIONS, FILTER_FIELDS, RESOURCE_TYPE_OPTIONS } from '@/ui/admin/audit/filter-constants'
import { SearchableOptionList } from '@/ui/admin/audit/SearchableOptionList'
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/components/popover'
import { cn } from '@/ui/lib/cn'

interface FilterAddButtonProps {
  filters: ActiveFilter[]
  onAddFilter: (field: AuditLogFilterFieldKey, value: string, label: string) => void
  actors: AuditLogActorDto[]
}

export function AuditLogFilterAddButton({ filters, onAddFilter, actors }: FilterAddButtonProps) {
  const [open, setOpen] = useState(false)
  const [selectedField, setSelectedField] = useState<AuditLogFilterFieldKey | null>(null)

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

  const handleAddAndClose = (field: AuditLogFilterFieldKey, value: string, label: string) => {
    onAddFilter(field, value, label)
    setOpen(false)
    resetPopover()
  }

  const handleFieldSelect = (field: AuditLogFilterFieldKey) => {
    if (field === 'date') {
      handleAddAndClose('date', JSON.stringify({ from: '', to: '' }), '时间')
      return
    }
    if (field === 'ip') {
      handleAddAndClose('ip', '', 'IP')
      return
    }
    setSelectedField(field)
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
          <FieldValuePicker field={selectedField} onBack={resetPopover} onSelect={handleAddAndClose} actors={actors} />
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
                    onClick={() => handleFieldSelect(field.key)}
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

interface FieldValuePickerProps {
  field: AuditLogFilterFieldKey
  onBack: () => void
  onSelect: (field: AuditLogFilterFieldKey, value: string, label: string) => void
  actors: AuditLogActorDto[]
}

function FieldValuePicker({ field, onBack, onSelect, actors }: FieldValuePickerProps) {
  const fieldDef = FILTER_FIELDS.find((f) => f.key === field)
  const fieldLabel = fieldDef?.label ?? field

  if (field === 'action') {
    return (
      <div className="flex flex-col">
        <PickerHeader label={fieldLabel} onBack={onBack} />
        <SearchableOptionList
          options={ACTION_OPTIONS.filter((o) => o.value !== '')}
          onSelect={(option) => onSelect('action', option.value, option.label)}
          placeholder="搜索操作类型…"
        />
      </div>
    )
  }

  if (field === 'resourceType') {
    return (
      <div className="flex flex-col">
        <PickerHeader label={fieldLabel} onBack={onBack} />
        <SearchableOptionList
          options={RESOURCE_TYPE_OPTIONS.filter((o) => o.value !== '')}
          onSelect={(option) => onSelect('resourceType', option.value, option.label)}
          placeholder="搜索资源类型…"
        />
      </div>
    )
  }

  if (field === 'actor') {
    return (
      <div className="flex flex-col">
        <PickerHeader label={fieldLabel} onBack={onBack} />
        <AuditLogActorPicker
          actors={actors}
          onSelect={(actor) => onSelect('actor', actor.actorId, actor.email || actor.actorName || actor.actorId)}
        />
      </div>
    )
  }

  return null
}

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
