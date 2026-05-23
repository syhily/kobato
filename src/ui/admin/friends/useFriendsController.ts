import { useReducer } from 'react'

import type { AdminFriendDto } from '@/shared/types/friends'

interface FriendsState {
  rows: AdminFriendDto[]
  total: number
  hasMore: boolean
  q: string
  includeHidden: boolean
  /** Zero-based current page. Mirrors the comment / tag controllers. */
  currentPage: number
  pageSize: number
}

type FriendsAction =
  | { type: 'loaded'; rows: AdminFriendDto[]; total: number; hasMore: boolean }
  | { type: 'setQ'; value: string }
  | { type: 'setIncludeHidden'; value: boolean }
  | { type: 'setCurrentPage'; value: number }
  | { type: 'setPageSize'; value: number }
  | { type: 'patchFriend'; friend: AdminFriendDto }
  | { type: 'removeFriend'; id: string }
  | { type: 'prependFriend'; friend: AdminFriendDto }

function friendsReducer(state: FriendsState, action: FriendsAction): FriendsState {
  switch (action.type) {
    case 'loaded':
      return { ...state, rows: action.rows, total: action.total, hasMore: action.hasMore }
    case 'setQ':
      // Reset to page 0 when the filter changes — the previous page
      // index is meaningless against the new result set.
      return { ...state, q: action.value, currentPage: 0 }
    case 'setIncludeHidden':
      // Same reset rationale: toggling visibility scope changes the
      // result set out from under the current page index.
      return { ...state, includeHidden: action.value, currentPage: 0 }
    case 'setCurrentPage':
      return { ...state, currentPage: action.value }
    case 'setPageSize':
      // Different page size → "page 3" no longer lines up with anything
      // stable; reset to page 0.
      return { ...state, pageSize: action.value, currentPage: 0 }
    case 'patchFriend':
      return {
        ...state,
        rows: state.rows.map((row) => (row.id === action.friend.id ? { ...row, ...action.friend } : row)),
      }
    case 'removeFriend':
      // Optimistic removal: drop the row from the visible page and
      // decrement `total`. The next reload re-syncs.
      return {
        ...state,
        rows: state.rows.filter((row) => row.id !== action.id),
        total: Math.max(0, state.total - 1),
      }
    case 'prependFriend':
      return { ...state, rows: [action.friend, ...state.rows], total: state.total + 1 }
  }
}

export function useFriendsController() {
  const [state, dispatch] = useReducer(friendsReducer, {
    rows: [],
    total: 0,
    hasMore: false,
    q: '',
    includeHidden: false,
    currentPage: 0,
    pageSize: 10,
  })
  return { state, dispatch }
}

export type FriendsControllerDispatch = ReturnType<typeof useFriendsController>['dispatch']
