import { useReducer } from 'react'

import type { AdminUserDto } from '@/shared/types/users'

export type RoleFilter = 'all' | 'admin' | 'author' | 'visitor' | 'normal'
export type SortOrder = 'recent' | 'commentCount'

interface UsersState {
  rows: AdminUserDto[]
  total: number
  hasMore: boolean
  currentPage: number
  pageSize: number
  q: string
  role: RoleFilter
  sortBy: SortOrder
  includeDeleted: boolean
  selected: Record<string, boolean>
}

type UsersAction =
  | { type: 'loaded'; rows: AdminUserDto[]; total: number; hasMore: boolean }
  | { type: 'setQ'; value: string }
  | { type: 'setRole'; value: RoleFilter }
  | { type: 'setSortBy'; value: SortOrder }
  | { type: 'setIncludeDeleted'; value: boolean }
  | { type: 'setPage'; value: number }
  | { type: 'setPageSize'; value: number }
  | { type: 'patchUser'; user: AdminUserDto }
  | { type: 'removeUser'; id: string }
  | { type: 'setSelected'; id: string; value: boolean }
  | { type: 'clearSelection' }
  | { type: 'toggleAll'; value: boolean }

function usersReducer(state: UsersState, action: UsersAction): UsersState {
  switch (action.type) {
    case 'loaded':
      return {
        ...state,
        rows: action.rows,
        total: action.total,
        hasMore: action.hasMore,
        selected: {},
      }
    case 'setQ':
      return { ...state, q: action.value, currentPage: 0 }
    case 'setRole':
      return { ...state, role: action.value, currentPage: 0 }
    case 'setSortBy':
      return { ...state, sortBy: action.value, currentPage: 0 }
    case 'setIncludeDeleted':
      return { ...state, includeDeleted: action.value, currentPage: 0 }
    case 'setPage':
      return { ...state, currentPage: action.value }
    case 'setPageSize':
      return { ...state, pageSize: action.value, currentPage: 0 }
    case 'patchUser':
      return {
        ...state,
        rows: state.rows.map((user) => (user.id === action.user.id ? { ...user, ...action.user } : user)),
      }
    case 'removeUser':
      return { ...state, rows: state.rows.filter((user) => user.id !== action.id) }
    case 'setSelected':
      return { ...state, selected: { ...state.selected, [action.id]: action.value } }
    case 'clearSelection':
      return { ...state, selected: {} }
    case 'toggleAll': {
      const next: Record<string, boolean> = {}
      if (action.value) {
        for (const user of state.rows) {
          next[user.id] = true
        }
      }
      return { ...state, selected: next }
    }
  }
}

export function useUsersController() {
  const [state, dispatch] = useReducer(usersReducer, {
    rows: [],
    total: 0,
    hasMore: false,
    currentPage: 0,
    pageSize: 10,
    q: '',
    role: 'all',
    sortBy: 'recent',
    includeDeleted: false,
    selected: {},
  })

  return { state, dispatch }
}
