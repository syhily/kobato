import { useReducer } from 'react'

import type { AdminCategoryDto } from '@/shared/types/categories'

import { rowsReducer, type RowsState } from '@/ui/admin/shared/rowsReducer'

interface CategoriesState extends RowsState<AdminCategoryDto> {
  q: string
}

type CategoriesAction =
  | { type: 'loaded'; rows: AdminCategoryDto[]; total: number }
  | { type: 'setQ'; value: string }
  | { type: 'patchCategory'; category: AdminCategoryDto }
  | { type: 'removeCategory'; id: string }
  | { type: 'prependCategory'; category: AdminCategoryDto }
  | { type: 'reorderRows'; orderedIds: string[] }
  | { type: 'replaceRows'; rows: AdminCategoryDto[] }

function categoriesReducer(state: CategoriesState, action: CategoriesAction): CategoriesState {
  switch (action.type) {
    case 'loaded':
      return { ...state, ...rowsReducer(state, action) }
    case 'setQ':
      return { ...state, q: action.value }
    case 'patchCategory':
      return { ...state, ...rowsReducer(state, { type: 'patch', row: action.category }) }
    case 'removeCategory':
      return { ...state, ...rowsReducer(state, { type: 'remove', id: action.id }) }
    case 'prependCategory':
      return { ...state, ...rowsReducer(state, { type: 'prepend', row: action.category }) }
    case 'reorderRows': {
      // Optimistic local reorder used while the server round-trip is in
      // flight. Rewrite each row's `sortOrder` to its new index so the
      // UI badge updates without waiting for the server response. The
      // server validates the id set and may reject the submission, in
      // which case the caller dispatches `replaceRows` (or `loaded`)
      // with the canonical rows.
      const byId = new Map(state.rows.map((row) => [row.id, row]))
      const next: AdminCategoryDto[] = []
      for (const [index, id] of action.orderedIds.entries()) {
        const row = byId.get(id)
        if (row) {
          next.push({ ...row, sortOrder: index })
        }
      }
      return { ...state, rows: next }
    }
    case 'replaceRows':
      return { ...state, rows: action.rows }
  }
}

export function useCategoriesReducer() {
  const [state, dispatch] = useReducer(categoriesReducer, {
    rows: [],
    total: 0,
    q: '',
  })
  return { state, dispatch }
}

export type CategoriesReducerDispatch = ReturnType<typeof useCategoriesReducer>['dispatch']
