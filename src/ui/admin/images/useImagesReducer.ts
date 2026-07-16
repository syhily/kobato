import { useReducer } from 'react'

import type { AdminImageKind } from '@/shared/types/images'

import { filterPillsReducer, type ActiveFilter, type FilterPillsAction } from '@/ui/admin/shared/filterPillsReducer'

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
      // Caller-level side effect kept local to this hook: removing the last
      // q pill also clears the search box mirror; a remaining q pill keeps it.
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
