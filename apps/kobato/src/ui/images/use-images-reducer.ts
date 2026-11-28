import type { AdminImageKind } from '@kobato/base/assets/images'

import { useReducer } from 'react'

import {
  filterPillsReducer,
  type ActiveFilter,
  type FilterPillsAction,
} from '@/ui/shared/filter-bar/filter-pills-reducer'

export type ImageFilterField = 'q' | 'kind'

export type ActiveImageFilter = ActiveFilter<ImageFilterField>

interface ImagesState {
  filters: ActiveImageFilter[]
  q: string
}

type ImagesAction = FilterPillsAction<ImageFilterField> | { type: 'setQ'; value: string }

const PAGE_SIZE = 60

function isAdminImageKind(value: string): value is AdminImageKind {
  return value === 'generic' || value === 'category' || value === 'friend'
}

function imagesReducer(state: ImagesState, action: ImagesAction): ImagesState {
  switch (action.type) {
    case 'setQ':
      return { ...state, q: action.value }
    case 'addFilter':
    case 'renameFilter':
      return { ...state, filters: filterPillsReducer(state.filters, action) }
    case 'removeFilter': {
      const filters = filterPillsReducer(state.filters, action)
      const q = filters.some((f) => f.field === 'q') ? state.q : ''
      return { ...state, filters, q }
    }
    case 'clearFilters':
      return { ...state, filters: filterPillsReducer(state.filters, action), q: '' }
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
