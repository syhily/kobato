import { useReducer } from 'react'

import type { AdminUserDto } from '@/shared/types/users'

export type RoleFilter = 'all' | 'admin' | 'author' | 'visitor' | 'normal'
export type SortOrder = 'recent' | 'commentCount'

interface UsersState {
  rows: AdminUserDto[]
  total: number
  hasMore: boolean
  pageSize: number
  q: string
  role: RoleFilter
  sortBy: SortOrder
  includeDeleted: boolean
}

type UsersAction =
  | { type: 'loaded'; rows: AdminUserDto[]; total: number; hasMore: boolean }
  | { type: 'appended'; rows: AdminUserDto[]; total: number; hasMore: boolean }
  | { type: 'setQ'; value: string }
  | { type: 'setRole'; value: RoleFilter }
  | { type: 'setSortBy'; value: SortOrder }
  | { type: 'setIncludeDeleted'; value: boolean }
  | { type: 'setPageSize'; value: number }
  | { type: 'patchUser'; user: AdminUserDto }
  | { type: 'removeUser'; id: string }

function usersReducer(state: UsersState, action: UsersAction): UsersState {
  switch (action.type) {
    case 'loaded':
      return {
        ...state,
        rows: action.rows,
        total: action.total,
        hasMore: action.hasMore,
      }
    case 'appended':
      return {
        ...state,
        rows: [...state.rows, ...action.rows],
        total: action.total,
        hasMore: action.hasMore,
      }
    case 'setQ':
      return { ...state, q: action.value }
    case 'setRole':
      return { ...state, role: action.value }
    case 'setSortBy':
      return { ...state, sortBy: action.value }
    case 'setIncludeDeleted':
      return { ...state, includeDeleted: action.value }
    case 'setPageSize':
      return { ...state, pageSize: action.value }
    case 'patchUser':
      return {
        ...state,
        rows: state.rows.map((user) => (user.id === action.user.id ? { ...user, ...action.user } : user)),
      }
    case 'removeUser':
      return { ...state, rows: state.rows.filter((user) => user.id !== action.id) }
  }
}

export function useUsersController() {
  const [state, dispatch] = useReducer(usersReducer, {
    rows: [],
    total: 0,
    hasMore: false,
    pageSize: 20,
    q: '',
    role: 'all',
    sortBy: 'recent',
    includeDeleted: false,
  })

  return { state, dispatch }
}
