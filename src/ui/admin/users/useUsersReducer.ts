import { useReducer } from 'react'

import type { AdminUserDto } from '@/shared/types/users'

import { rowsReducer, type RowsState } from '@/ui/admin/shared/rowsReducer'

export type RoleFilter = 'all' | 'admin' | 'author' | 'visitor' | 'normal'
export type SortOrder = 'recent' | 'commentCount'

interface UsersState extends RowsState<AdminUserDto> {
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
    case 'appended':
      // `hasMore` stays on the entity slice; the machine owns rows/total.
      return { ...state, ...rowsReducer(state, action), hasMore: action.hasMore }
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
      return { ...state, ...rowsReducer(state, { type: 'patch', row: action.user }) }
    case 'removeUser':
      // Machine semantics: removing a user also decrements `total` so the
      // header count updates immediately (unified with the other four
      // admin rows surfaces — this hook previously skipped the decrement).
      return { ...state, ...rowsReducer(state, { type: 'remove', id: action.id }) }
  }
}

export function useUsersReducer() {
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
