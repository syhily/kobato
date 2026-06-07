import { XIcon } from 'lucide-react'

import type { ActiveFilter, FilterFieldKey, FilterItem } from '@/ui/admin/comments/useCommentsController'

import { FilterAddButton } from '@/ui/admin/comments/FilterAddButton'
import { FilterPill } from '@/ui/admin/comments/FilterPill'

interface CommentsFilterBarProps {
  filters: ActiveFilter[]
  onAddFilter: (field: FilterFieldKey, value: string, label: string) => void
  onRemoveFilter: (field: FilterFieldKey) => void
  onClearFilters: () => void
  pageItems: FilterItem[]
  authorItems: FilterItem[]
  onPageSearch: (query: string) => void
  onAuthorSearch: (query: string) => void
  isPagesPending?: boolean
  isAuthorsPending?: boolean
}

export function CommentsFilterBar({
  filters,
  onAddFilter,
  onRemoveFilter,
  onClearFilters,
  pageItems,
  authorItems,
  onPageSearch,
  onAuthorSearch,
  isPagesPending,
  isAuthorsPending,
}: CommentsFilterBarProps) {
  const hasFilters = filters.length > 0

  if (!hasFilters) {
    return (
      <FilterAddButton
        filters={filters}
        onAddFilter={onAddFilter}
        pageItems={pageItems}
        authorItems={authorItems}
        onPageSearch={onPageSearch}
        onAuthorSearch={onAuthorSearch}
        isPagesPending={isPagesPending}
        isAuthorsPending={isAuthorsPending}
      />
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      {filters.map((filter) => (
        <FilterPill
          key={filter.field}
          filter={filter}
          onRemove={() => onRemoveFilter(filter.field)}
          onValueChange={(value, label) => onAddFilter(filter.field, value, label)}
          pageItems={pageItems}
          authorItems={authorItems}
          onPageSearch={onPageSearch}
          onAuthorSearch={onAuthorSearch}
          isPagesPending={isPagesPending}
          isAuthorsPending={isAuthorsPending}
        />
      ))}
      <FilterAddButton
        filters={filters}
        onAddFilter={onAddFilter}
        pageItems={pageItems}
        authorItems={authorItems}
        onPageSearch={onPageSearch}
        onAuthorSearch={onAuthorSearch}
        isPagesPending={isPagesPending}
        isAuthorsPending={isAuthorsPending}
      />
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
