import { useReducer } from 'react'

import type { AdminPageDto } from '@/shared/types/pages'

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

interface PagesState {
  rows: AdminPageDto[]
  total: number
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
      return { ...state, rows: action.rows, total: action.total }
    case 'appended':
      return { ...state, rows: [...state.rows, ...action.rows], total: action.total }
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
      return {
        ...state,
        rows: state.rows.map((row) => (row.id === action.page.id ? { ...row, ...action.page } : row)),
      }
    case 'removePage':
      return {
        ...state,
        rows: state.rows.filter((row) => row.id !== action.id),
        total: Math.max(0, state.total - 1),
      }
    case 'prependPage':
      return { ...state, rows: [action.page, ...state.rows], total: state.total + 1 }
  }
}

export function usePagesController() {
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

export type PagesControllerDispatch = ReturnType<typeof usePagesController>['dispatch']
