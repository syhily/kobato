import { useReducer } from 'react'

import type { AdminTagDto } from '@/shared/types/tags'

import { rowsReducer, type RowsState } from '@/ui/admin/shared/rowsReducer'

interface TagsState extends RowsState<AdminTagDto> {
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
    case 'appended':
      // `hasMore` stays on the entity slice; the machine owns rows/total.
      return { ...state, ...rowsReducer(state, action), hasMore: action.hasMore }
    case 'setQ':
      return { ...state, q: action.value }
    case 'patchTag':
      return { ...state, ...rowsReducer(state, { type: 'patch', row: action.tag }) }
    case 'removeTag':
      return { ...state, ...rowsReducer(state, { type: 'remove', id: action.id }) }
    case 'prependTag':
      return { ...state, ...rowsReducer(state, { type: 'prepend', row: action.tag }) }
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
