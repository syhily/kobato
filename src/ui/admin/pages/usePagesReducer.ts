import { useReducer } from 'react'

import type { AdminPageDto } from '@/shared/types/pages'

import { rowsReducer, type RowsState } from '@/ui/admin/shared/rowsReducer'

export type PageStatusFilter = 'all' | 'published' | 'draft' | 'deleted'

function deriveStatusFields(status: PageStatusFilter): {
  deletedStatus: 'all' | 'deleted' | 'normal'
  published?: boolean
} {
  if (status === 'deleted') {
    return { deletedStatus: 'deleted' }
  }
  const statusMap: Record<Exclude<PageStatusFilter, 'deleted'>, { published?: boolean }> = {
    all: {},
    published: { published: true },
    draft: { published: false },
  }
  return { deletedStatus: 'normal', ...statusMap[status as Exclude<PageStatusFilter, 'deleted'>] }
}

interface PagesState extends RowsState<AdminPageDto> {
  q: string
  deletedStatus: 'all' | 'deleted' | 'normal'
  published?: boolean
  status: PageStatusFilter
  authorId: string
}

type PagesAction =
  | { type: 'loaded'; rows: AdminPageDto[]; total: number }
  | { type: 'appended'; rows: AdminPageDto[]; total: number }
  | { type: 'setQ'; value: string }
  | { type: 'setStatus'; value: PageStatusFilter }
  | { type: 'setAuthorId'; value: string }
  | { type: 'patchPage'; page: AdminPageDto }
  | { type: 'removePage'; id: string }
  | { type: 'prependPage'; page: AdminPageDto }

function pagesReducer(state: PagesState, action: PagesAction): PagesState {
  switch (action.type) {
    case 'loaded':
    case 'appended':
      return { ...state, ...rowsReducer(state, action) }
    case 'setQ':
      return { ...state, q: action.value }
    case 'setStatus': {
      const derived = deriveStatusFields(action.value)
      return {
        ...state,
        status: action.value,
        deletedStatus: derived.deletedStatus,
        published: derived.published,
      }
    }
    case 'setAuthorId':
      return { ...state, authorId: action.value }
    case 'patchPage':
      return { ...state, ...rowsReducer(state, { type: 'patch', row: action.page }) }
    case 'removePage':
      return { ...state, ...rowsReducer(state, { type: 'remove', id: action.id }) }
    case 'prependPage':
      return { ...state, ...rowsReducer(state, { type: 'prepend', row: action.page }) }
  }
}

export function usePagesReducer() {
  const [state, dispatch] = useReducer(pagesReducer, {
    rows: [],
    total: 0,
    q: '',
    deletedStatus: 'normal',
    status: 'all' as PageStatusFilter,
    authorId: '',
  })

  return { state, dispatch }
}

export type PagesReducerDispatch = ReturnType<typeof usePagesReducer>['dispatch']
