import { XIcon } from 'lucide-react'

import type { AuditLogActorDto } from '@/shared/types/audit'
import type { ActiveFilter, AuditLogFilterFieldKey } from '@/ui/admin/audit/useAuditLogController'

import { AuditLogFilterAddButton } from '@/ui/admin/audit/AuditLogFilterAddButton'
import { AuditLogFilterPill } from '@/ui/admin/audit/AuditLogFilterPill'

interface AuditLogFilterBarProps {
  filters: ActiveFilter[]
  onAddFilter: (field: AuditLogFilterFieldKey, value: string, label: string) => void
  onRemoveFilter: (field: AuditLogFilterFieldKey) => void
  onClearFilters: () => void
  actors: AuditLogActorDto[]
}

export function AuditLogFilterBar({
  filters,
  onAddFilter,
  onRemoveFilter,
  onClearFilters,
  actors,
}: AuditLogFilterBarProps) {
  const hasFilters = filters.length > 0

  if (!hasFilters) {
    return <AuditLogFilterAddButton filters={filters} onAddFilter={onAddFilter} actors={actors} />
  }

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      {filters.map((filter) => (
        <AuditLogFilterPill
          key={filter.field}
          filter={filter}
          onRemove={() => onRemoveFilter(filter.field)}
          onValueChange={(value, label) => onAddFilter(filter.field, value, label)}
          actors={actors}
        />
      ))}
      <AuditLogFilterAddButton filters={filters} onAddFilter={onAddFilter} actors={actors} />
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
