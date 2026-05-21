import { useReducer } from 'react'

interface AuditLogState {
  currentPage: number
  pageSize: number
  action: string
  resourceType: string
  actorId: string
  dateFrom: string
  dateTo: string
}

type AuditLogAction =
  | { type: 'setPage'; value: number }
  | { type: 'setPageSize'; value: number }
  | { type: 'setAction'; value: string }
  | { type: 'setResourceType'; value: string }
  | { type: 'setActorId'; value: string }
  | { type: 'setDateFrom'; value: string }
  | { type: 'setDateTo'; value: string }
  | { type: 'setDateRange'; from: string; to: string }
  | { type: 'resetFilters' }

function auditLogReducer(state: AuditLogState, action: AuditLogAction): AuditLogState {
  switch (action.type) {
    case 'setPage':
      return { ...state, currentPage: action.value }
    case 'setPageSize':
      return { ...state, pageSize: action.value, currentPage: 0 }
    case 'setAction':
      return { ...state, action: action.value, currentPage: 0 }
    case 'setResourceType':
      return { ...state, resourceType: action.value, currentPage: 0 }
    case 'setActorId':
      return { ...state, actorId: action.value, currentPage: 0 }
    case 'setDateFrom':
      return { ...state, dateFrom: action.value, currentPage: 0 }
    case 'setDateTo':
      return { ...state, dateTo: action.value, currentPage: 0 }
    case 'setDateRange':
      return { ...state, dateFrom: action.from, dateTo: action.to, currentPage: 0 }
    case 'resetFilters':
      return {
        ...state,
        action: '',
        resourceType: '',
        actorId: '',
        dateFrom: '',
        dateTo: '',
        currentPage: 0,
      }
  }
}

export function useAuditLogController() {
  const [state, dispatch] = useReducer(auditLogReducer, {
    currentPage: 0,
    pageSize: 20,
    action: '',
    resourceType: '',
    actorId: '',
    dateFrom: '',
    dateTo: '',
  })

  return { state, dispatch }
}
