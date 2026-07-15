import { useReducer } from 'react'

import type { AdminTagDto } from '@/shared/types/tags'

interface TagsState {
  rows: AdminTagDto[]
  total: number
  hasMore: boolean
  q: string
}

type TagsAction =
  | { type: 'loaded'; rows: AdminTagDto[]; total: number; hasMore: boolean }
  | { type: 'appended'; rows: AdminTagDto[]; total: number; hasMore: boolean }
  | { type: 'setQ'; value: string }
  | { type: 'patchTag'; tag: AdminTagDto }
  | { type: 'removeTag'; id: string }
  | { type: 'prependTag'; tag: AdminTagDto }

function tagsReducer(state: TagsState, action: TagsAction): TagsState {
  switch (action.type) {
    case 'loaded':
      return { ...state, rows: action.rows, total: action.total, hasMore: action.hasMore }
    case 'appended':
      return { ...state, rows: [...state.rows, ...action.rows], total: action.total, hasMore: action.hasMore }
    case 'setQ':
      return { ...state, q: action.value }
    case 'patchTag':
      return {
        ...state,
        rows: state.rows.map((row) => (row.id === action.tag.id ? { ...row, ...action.tag } : row)),
      }
    case 'removeTag':
      // Optimistic removal: drop the row from the visible list and
      // decrement `total`. The next scroll/load re-syncs if needed.
      return {
        ...state,
        rows: state.rows.filter((row) => row.id !== action.id),
        total: Math.max(0, state.total - 1),
      }
    case 'prependTag':
      return { ...state, rows: [action.tag, ...state.rows], total: state.total + 1 }
  }
}

export function useTagsReducer() {
  const [state, dispatch] = useReducer(tagsReducer, {
    rows: [],
    total: 0,
    hasMore: false,
    q: '',
  })
  return { state, dispatch }
}

export type TagsReducerDispatch = ReturnType<typeof useTagsReducer>['dispatch']
