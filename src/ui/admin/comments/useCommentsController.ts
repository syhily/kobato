import { useReducer } from 'react'

import type { AdminCommentWire as AdminComment } from '@/shared/contracts/comments'
import type { CommentBody } from '@/shared/pt/comment-schema'

import { idStr } from '@/shared/utils/tools'

export type FilterStatus = 'all' | 'pending' | 'approved'

export type FilterFieldKey = 'status' | 'page' | 'author' | 'text' | 'date'

export interface ActiveFilter {
  field: FilterFieldKey
  value: string
  label: string
}

export interface FilterItem {
  value: string
  label: string
}

export interface StatusCounts {
  all: number
  pending: number
  approved: number
}

const PAGE_SIZE = 10

interface CommentsState {
  comments: AdminComment[]
  total: number
  filters: ActiveFilter[]
  statusCounts: StatusCounts
}

type CommentsAction =
  | {
      type: 'loaded'
      comments: AdminComment[]
      total: number
      statusCounts: StatusCounts
    }
  | {
      type: 'appended'
      comments: AdminComment[]
      total: number
    }
  | { type: 'removeComment'; id: string }
  | { type: 'approveComment'; id: string }
  | { type: 'updateCommentContent'; id: string; body: CommentBody }
  | { type: 'addFilter'; field: FilterFieldKey; value: string; label: string }
  | { type: 'removeFilter'; field: FilterFieldKey }
  | { type: 'renameFilter'; field: FilterFieldKey; label: string }
  | { type: 'clearFilters' }

function commentsReducer(state: CommentsState, action: CommentsAction): CommentsState {
  switch (action.type) {
    case 'loaded':
      return {
        ...state,
        comments: action.comments,
        total: action.total,
        statusCounts: action.statusCounts,
      }
    case 'appended':
      return {
        ...state,
        comments: [...state.comments, ...action.comments],
        total: action.total,
      }
    case 'removeComment':
      return {
        ...state,
        comments: state.comments.filter((comment) => idStr(comment.id) !== action.id),
      }
    case 'approveComment':
      return {
        ...state,
        comments: state.comments.map((comment) =>
          idStr(comment.id) === action.id ? { ...comment, isPending: false } : comment,
        ),
      }
    case 'updateCommentContent':
      return {
        ...state,
        comments: state.comments.map((comment) =>
          idStr(comment.id) === action.id ? { ...comment, body: action.body } : comment,
        ),
      }
    case 'addFilter': {
      const next = state.filters.filter((f) => f.field !== action.field)
      next.push({ field: action.field, value: action.value, label: action.label })
      return { ...state, filters: next }
    }
    case 'removeFilter':
      return { ...state, filters: state.filters.filter((f) => f.field !== action.field) }
    case 'renameFilter': {
      const idx = state.filters.findIndex((f) => f.field === action.field)
      if (idx === -1) {
        return state
      }
      const next = [...state.filters]
      next[idx] = { ...next[idx]!, label: action.label }
      return { ...state, filters: next }
    }
    case 'clearFilters':
      return { ...state, filters: [] }
  }
}

export interface UseCommentsControllerOptions {
  initialFilters: ActiveFilter[]
}

export function useCommentsController({ initialFilters }: UseCommentsControllerOptions) {
  const [state, dispatch] = useReducer(commentsReducer, {
    comments: [],
    total: 0,
    filters: initialFilters,
    statusCounts: { all: 0, pending: 0, approved: 0 },
  })

  const statusFilter = state.filters.find((f) => f.field === 'status')
  const pageFilter = state.filters.find((f) => f.field === 'page')
  const authorFilter = state.filters.find((f) => f.field === 'author')
  const textFilter = state.filters.find((f) => f.field === 'text')
  const dateFilter = state.filters.find((f) => f.field === 'date')

  return {
    state,
    dispatch,
    pageSize: PAGE_SIZE,
    hasMore: state.comments.length < state.total,
    filterStatus: (statusFilter?.value ?? 'all') as FilterStatus,
    filterPageKey: pageFilter?.value ?? '',
    filterAuthorId: authorFilter?.value ?? '',
    filterQ: textFilter?.value ?? '',
    filterCreatedAfter: dateFilter?.value ? dateFilter.value.split('/')[0] || undefined : undefined,
    filterCreatedBefore: dateFilter?.value ? dateFilter.value.split('/')[1] || undefined : undefined,
  }
}
