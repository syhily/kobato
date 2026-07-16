import { useMemo, useReducer } from 'react'

import type { AuditLogActorDto, AuditLogItemDto } from '@/shared/types/audit'

import {
  dateFilterLabel,
  parseDateFilter,
  resolveDateFilterBounds,
  type DateFilterValue,
} from '@/ui/admin/shared/date-filter'
import {
  filterPillsReducer,
  type ActiveFilter as GenericActiveFilter,
  type FilterPillsAction,
} from '@/ui/admin/shared/filterPillsReducer'

export type AuditLogFilterFieldKey = 'action' | 'resourceType' | 'actor' | 'ip' | 'date'

export type ActiveFilter = GenericActiveFilter<AuditLogFilterFieldKey>

export type { DateFilterValue }
export { dateFilterLabel, parseDateFilter, resolveDateFilterBounds }

const PAGE_SIZE = 20

export interface AuditLogState {
  items: AuditLogItemDto[]
  total: number
  hasMore: boolean
  filters: ActiveFilter[]
}

export type AuditLogAction =
  | { type: 'loaded'; items: AuditLogItemDto[]; total: number; hasMore: boolean }
  | { type: 'appended'; items: AuditLogItemDto[]; total: number; hasMore: boolean }
  | FilterPillsAction<AuditLogFilterFieldKey>

export function auditLogReducer(state: AuditLogState, action: AuditLogAction): AuditLogState {
  switch (action.type) {
    case 'loaded':
      return {
        ...state,
        items: action.items,
        total: action.total,
        hasMore: action.hasMore,
      }
    case 'appended':
      return {
        ...state,
        items: [...state.items, ...action.items],
        total: action.total,
        hasMore: action.hasMore,
      }
    case 'addFilter':
    case 'removeFilter':
    case 'renameFilter':
    case 'clearFilters':
      return { ...state, filters: filterPillsReducer(state.filters, action) }
  }
}

export interface UseAuditLogReducerOptions {
  initialFilters?: ActiveFilter[]
}

export function useAuditLogReducer({ initialFilters = [] }: UseAuditLogReducerOptions = {}) {
  const [state, dispatch] = useReducer(auditLogReducer, {
    items: [],
    total: 0,
    hasMore: false,
    filters: initialFilters,
  })

  const actionFilter = state.filters.find((f) => f.field === 'action')
  const resourceTypeFilter = state.filters.find((f) => f.field === 'resourceType')
  const actorFilter = state.filters.find((f) => f.field === 'actor')
  const dateFilter = state.filters.find((f) => f.field === 'date')

  const dateRange = useMemo(() => (dateFilter ? parseDateFilter(dateFilter.value) : null), [dateFilter])
  const dateBounds = useMemo(() => resolveDateFilterBounds(dateRange), [dateRange])

  return {
    state,
    dispatch,
    pageSize: PAGE_SIZE,
    hasMore: state.hasMore,
    filterAction: actionFilter?.value ?? '',
    filterResourceType: resourceTypeFilter?.value ?? '',
    filterActorId: actorFilter?.value ?? '',
    filterDateFrom: dateBounds.from ?? '',
    filterDateTo: dateBounds.to ?? '',
  }
}

export function findActorLabel(actors: AuditLogActorDto[] | undefined, actorId: string): string {
  if (!actorId || !actors) {
    return ''
  }
  const actor = actors.find((a) => a.actorId === actorId)
  return actor?.email ?? actor?.actorName ?? actorId
}
