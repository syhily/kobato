import { XIcon } from 'lucide-react'
import { useMemo, useState } from 'react'

import type { AuditLogActorDto } from '@/shared/contracts/audit'

import { AuditLogActorPicker } from '@/ui/admin/audit/AuditLogActorPicker'
import {
  ACTION_OPTIONS,
  type ActiveFilter,
  FILTER_FIELDS,
  RESOURCE_TYPE_OPTIONS,
} from '@/ui/admin/audit/filter-constants'
import { SearchableOptionList } from '@/ui/admin/audit/SearchableOptionList'
import { dateFilterLabel, type DateFilterValue, parseDateFilter } from '@/ui/admin/shared/date-filter'
import { DateRangePicker } from '@/ui/admin/shared/DateRangePicker'
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/components/popover'
import { cn } from '@/ui/lib/cn'

interface AuditLogFilterPillProps {
  filter: ActiveFilter
  onRemove: () => void
  onValueChange: (value: string, label: string) => void
  actors: AuditLogActorDto[]
}

export function AuditLogFilterPill({ filter, onRemove, onValueChange, actors }: AuditLogFilterPillProps) {
  const fieldDef = FILTER_FIELDS.find((f) => f.key === filter.field)
  const fieldLabel = fieldDef?.label ?? filter.field
  const FieldIcon = fieldDef?.icon
  const dateValue = useMemo(
    () => (filter.field === 'date' ? (parseDateFilter(filter.value) ?? { from: '', to: '' }) : null),
    [filter.field, filter.value],
  )

  return (
    <div className="flex items-center">
      <div className="flex h-9 shrink-0 items-center gap-1.5 rounded-l-md border border-r-0 border-border bg-background px-3 text-sm text-foreground">
        {FieldIcon && <FieldIcon className="size-3.5 text-muted-foreground" />}
        {fieldLabel}
      </div>
      <div className="flex h-9 items-center border border-r-0 border-border bg-background">
        {filter.field === 'action' ? (
          <OptionValuePicker
            options={ACTION_OPTIONS.filter((o) => o.value !== '')}
            value={filter.value}
            onChange={onValueChange}
            searchable
            placeholder="搜索操作类型…"
          />
        ) : filter.field === 'resourceType' ? (
          <OptionValuePicker
            options={RESOURCE_TYPE_OPTIONS.filter((o) => o.value !== '')}
            value={filter.value}
            onChange={onValueChange}
          />
        ) : filter.field === 'actor' ? (
          <ActorValuePicker value={filter.value} onChange={onValueChange} actors={actors} />
        ) : filter.field === 'ip' ? (
          <IpFilterEditor value={filter.value} onChange={onValueChange} />
        ) : filter.field === 'date' && dateValue ? (
          <DateFilterEditor
            value={dateValue}
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

function OptionValuePicker({
  options,
  value,
  onChange,
  searchable = false,
  placeholder,
}: {
  options: { value: string; label: string }[]
  value: string
  onChange: (value: string, label: string) => void
  searchable?: boolean
  placeholder?: string
}) {
  const currentLabel = options.find((o) => o.value === value)?.label ?? value
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
      <PopoverContent align="start" className="w-56 p-0">
        {searchable ? (
          <SearchableOptionList
            options={options}
            selectedValue={value}
            onSelect={(option) => {
              onChange(option.value, option.label)
              setOpen(false)
            }}
            placeholder={placeholder}
          />
        ) : (
          <div className="max-h-60 overflow-y-auto p-1">
            {options.map((option) => (
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
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

function ActorValuePicker({
  value,
  onChange,
  actors,
}: {
  value: string
  onChange: (value: string, label: string) => void
  actors: AuditLogActorDto[]
}) {
  const actor = actors.find((a) => a.actorId === value)
  const currentLabel = actor?.email ?? actor?.actorName ?? value
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(
          'flex h-full cursor-pointer items-center gap-1 px-3 text-sm text-foreground transition',
          'hover:bg-secondary',
        )}
      >
        {currentLabel || '选择操作人'}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-0">
        <AuditLogActorPicker
          actors={actors}
          selectedId={value}
          onSelect={(a) => {
            const label = a.email || a.actorName || a.actorId
            onChange(a.actorId, label)
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

function IpFilterEditor({ value, onChange }: { value: string; onChange: (value: string, label: string) => void }) {
  const [draft, setDraft] = useState(value)

  const commit = () => {
    const trimmed = draft.trim()
    if (trimmed !== value) {
      onChange(trimmed, trimmed || 'IP')
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
      placeholder="输入 IP 或片段"
      className="h-9 min-w-0 flex-1 bg-transparent px-2.5 text-sm outline-none placeholder:text-muted-foreground"
    />
  )
}

function DateFilterEditor({ value, onChange }: { value: DateFilterValue; onChange: (next: DateFilterValue) => void }) {
  return (
    <div className="flex h-full items-center px-2">
      <DateRangePicker from={value.from} to={value.to} onChange={(from, to) => onChange({ from, to })} />
    </div>
  )
}
