import { useReducer } from 'react'

import type { AdminFriendDto } from '@/shared/types/friends'

interface FriendsState {
  rows: AdminFriendDto[]
  total: number
  hasMore: boolean
  q: string
  includeHidden: boolean
}

type FriendsAction =
  | { type: 'loaded'; rows: AdminFriendDto[]; total: number; hasMore: boolean }
  | { type: 'appended'; rows: AdminFriendDto[]; total: number; hasMore: boolean }
  | { type: 'setQ'; value: string }
  | { type: 'setIncludeHidden'; value: boolean }
  | { type: 'patchFriend'; friend: AdminFriendDto }
  | { type: 'removeFriend'; id: string }
  | { type: 'prependFriend'; friend: AdminFriendDto }

const PAGE_SIZE = 30

function friendsReducer(state: FriendsState, action: FriendsAction): FriendsState {
  switch (action.type) {
    case 'loaded':
      return { ...state, rows: action.rows, total: action.total, hasMore: action.hasMore }
    case 'appended':
      return {
        ...state,
        rows: [...state.rows, ...action.rows],
        total: action.total,
        hasMore: action.hasMore,
      }
    case 'setQ':
      // Reset list to first page when the filter changes — the previous
      // offset is meaningless against the new result set.
      return { ...state, q: action.value }
    case 'setIncludeHidden':
      // Same reset rationale: toggling visibility scope changes the
      // result set out from under the current offset.
      return { ...state, includeHidden: action.value }
    case 'patchFriend':
      return {
        ...state,
        rows: state.rows.map((row) => (row.id === action.friend.id ? { ...row, ...action.friend } : row)),
      }
    case 'removeFriend':
      // Optimistic removal: drop the row from the visible list and
      // decrement `total`. The next scroll/load re-syncs if needed.
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
  })
  return { state, dispatch }
}

export type FriendsControllerDispatch = ReturnType<typeof useFriendsController>['dispatch']

export { PAGE_SIZE }
