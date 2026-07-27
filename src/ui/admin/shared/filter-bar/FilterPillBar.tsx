import { XIcon } from 'lucide-react'

import type { FilterPillBarProps } from '@/ui/admin/shared/filter-bar/types'

import { FilterAddButton } from '@/ui/admin/shared/filter-bar/add-button'
import { FilterPill } from '@/ui/admin/shared/filter-bar/pill'

// The filter chrome shared by every admin list surface: with no active
// filters just the 筛选 trigger; otherwise the pill row + 添加筛选 + 清除.
// Views render it as `<FilterPillBar {...pills.bar} />` — all state and
// callbacks come from `useFilterPills`.

export function FilterPillBar<K extends string>({
  fields,
  filters,
  search,
  onAddFilter,
  onRemoveFilter,
  onClearFilters,
}: FilterPillBarProps<K>) {
  const hasFilters = filters.length > 0

  if (!hasFilters) {
    return <FilterAddButton fields={fields} filters={filters} search={search} onAddFilter={onAddFilter} />
  }

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      {filters.map((filter) => (
        <FilterPill
          key={filter.field}
          field={fields.find((f) => f.key === filter.field)}
          filter={filter}
          search={search}
          onRemove={() => onRemoveFilter(filter.field)}
          onValueChange={(value, label) => onAddFilter(filter.field, value, label)}
        />
      ))}
      <FilterAddButton fields={fields} filters={filters} search={search} onAddFilter={onAddFilter} />
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
