import { useReducer } from 'react'

import type { AdminImageKind } from '@/shared/types/images'

interface ImagesState {
  q: string
  kind: AdminImageKind | 'all'
  pageSize: number
}

type ImagesAction =
  | { type: 'setQ'; value: string }
  | { type: 'setKind'; value: AdminImageKind | 'all' }
  | { type: 'setPageSize'; value: number }

function imagesReducer(state: ImagesState, action: ImagesAction): ImagesState {
  switch (action.type) {
    case 'setQ':
      return { ...state, q: action.value }
    case 'setKind':
      return { ...state, kind: action.value }
    case 'setPageSize':
      return { ...state, pageSize: action.value }
  }
}

export function useImagesController() {
  const [state, dispatch] = useReducer(imagesReducer, {
    q: '',
    kind: 'all',
    pageSize: 30,
  })
  return { state, dispatch }
}
