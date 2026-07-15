import { useReducer } from 'react'

import type { AdminImageKind } from '@/shared/types/images'

export type ImageFilterField = 'q' | 'kind'

export interface ActiveImageFilter {
  field: ImageFilterField
  value: string
  label: string
}

interface ImagesState {
  filters: ActiveImageFilter[]
  q: string
}

type ImagesAction =
  | { type: 'addFilter'; field: ImageFilterField; value: string; label: string }
  | { type: 'removeFilter'; field: ImageFilterField }
  | { type: 'renameFilter'; field: ImageFilterField; label: string }
  | { type: 'setQ'; value: string }
  | { type: 'clearFilters' }

const PAGE_SIZE = 60

function isAdminImageKind(value: string): value is AdminImageKind {
  return value === 'generic' || value === 'category' || value === 'friend'
}

function imagesReducer(state: ImagesState, action: ImagesAction): ImagesState {
  switch (action.type) {
    case 'addFilter': {
      const next = state.filters.filter((f) => f.field !== action.field)
      return { ...state, filters: [...next, { field: action.field, value: action.value, label: action.label }] }
    }
    case 'removeFilter': {
      const next = state.filters.filter((f) => f.field !== action.field)
      const q = next.some((f) => f.field === 'q') ? state.q : ''
      return { ...state, filters: next, q }
    }
    case 'renameFilter': {
      const idx = state.filters.findIndex((f) => f.field === action.field)
      if (idx === -1) {
        return state
      }
      const next = [...state.filters]
      next[idx] = { ...next[idx]!, label: action.label }
      return { ...state, filters: next }
    }
    case 'setQ':
      return { ...state, q: action.value }
    case 'clearFilters':
      return { filters: [], q: '' }
  }
}

export function useImagesReducer() {
  const [state, dispatch] = useReducer(imagesReducer, {
    filters: [],
    q: '',
  })

  const kind: AdminImageKind | 'all' = (() => {
    const value = state.filters.find((f) => f.field === 'kind')?.value
    if (value !== undefined && isAdminImageKind(value)) {
      return value
    }
    return 'all'
  })()

  return {
    state,
    dispatch,
    pageSize: PAGE_SIZE,
    q: state.q,
    kind,
    activeFilters: state.filters,
  }
}
