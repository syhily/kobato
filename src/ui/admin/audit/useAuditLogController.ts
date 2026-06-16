import { useMemo, useReducer } from 'react'

import type { AuditLogActorDto, AuditLogItemDto } from '@/shared/types/audit'

import {
  dateFilterLabel,
  parseDateFilter,
  resolveDateFilterBounds,
  type DateFilterValue,
} from '@/ui/admin/shared/date-filter'

export type AuditLogFilterFieldKey = 'action' | 'resourceType' | 'actor' | 'ip' | 'date'

export interface ActiveFilter {
  field: AuditLogFilterFieldKey
  value: string
  label: string
}

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
  | { type: 'addFilter'; field: AuditLogFilterFieldKey; value: string; label: string }
  | { type: 'removeFilter'; field: AuditLogFilterFieldKey }
  | { type: 'renameFilter'; field: AuditLogFilterFieldKey; label: string }
  | { type: 'clearFilters' }

function auditLogReducer(state: AuditLogState, action: AuditLogAction): AuditLogState {
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
    case 'addFilter': {
      const next = state.filters.filter((f) => f.field !== action.field)
      return { ...state, filters: [...next, { field: action.field, value: action.value, label: action.label }] }
    }
    case 'removeFilter':
      return { ...state, filters: state.filters.filter((f) => f.field !== action.field) }
    case 'renameFilter': {
      const idx = state.filters.findIndex((f) => f.field === action.field)
      if (idx === -1) {
        return state
      }
      const next = [...state.filters]
      next[idx] = { ...next[idx]!, label: action.label }
      return { ...state, filters: next }
    }
    case 'clearFilters':
      return { ...state, filters: [] }
  }
}

export interface UseAuditLogControllerOptions {
  initialFilters?: ActiveFilter[]
}

export function useAuditLogController({ initialFilters = [] }: UseAuditLogControllerOptions = {}) {
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
