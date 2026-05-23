import { useReducer } from 'react'

import type { AdminTagDto } from '@/shared/types/tags'

interface TagsState {
  rows: AdminTagDto[]
  total: number
  hasMore: boolean
  q: string
  /** Zero-based current page. Mirrors the comment moderation controller. */
  currentPage: number
  pageSize: number
}

type TagsAction =
  | { type: 'loaded'; rows: AdminTagDto[]; total: number; hasMore: boolean }
  | { type: 'setQ'; value: string }
  | { type: 'setCurrentPage'; value: number }
  | { type: 'setPageSize'; value: number }
  | { type: 'patchTag'; tag: AdminTagDto }
  | { type: 'removeTag'; id: string }
  | { type: 'prependTag'; tag: AdminTagDto }

function tagsReducer(state: TagsState, action: TagsAction): TagsState {
  switch (action.type) {
    case 'loaded':
      return { ...state, rows: action.rows, total: action.total, hasMore: action.hasMore }
    case 'setQ':
      // Reset to page 0 when the filter changes — the previous page
      // index is meaningless against the new result set.
      return { ...state, q: action.value, currentPage: 0 }
    case 'setCurrentPage':
      return { ...state, currentPage: action.value }
    case 'setPageSize':
      // Same rationale as `setQ`: a different page size means the
      // current "page 3" no longer lines up with anything stable.
      return { ...state, pageSize: action.value, currentPage: 0 }
    case 'patchTag':
      return {
        ...state,
        rows: state.rows.map((row) => (row.id === action.tag.id ? { ...row, ...action.tag } : row)),
      }
    case 'removeTag':
      // Optimistic removal: drop the row from the visible page and
      // decrement `total`. We deliberately don't try to fetch the
      // next-page replacement row — the next reload (e.g. on a
      // subsequent search-change or page-change) re-syncs.
      return {
        ...state,
        rows: state.rows.filter((row) => row.id !== action.id),
        total: Math.max(0, state.total - 1),
      }
    case 'prependTag':
      return { ...state, rows: [action.tag, ...state.rows], total: state.total + 1 }
  }
}

export function useTagsController() {
  const [state, dispatch] = useReducer(tagsReducer, {
    rows: [],
    total: 0,
    hasMore: false,
    q: '',
    currentPage: 0,
    pageSize: 10,
  })
  return { state, dispatch }
}

export type TagsControllerDispatch = ReturnType<typeof useTagsController>['dispatch']
