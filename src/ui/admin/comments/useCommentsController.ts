import { useReducer } from 'react'

import type { AdminCommentWire as AdminComment } from '@/shared/contracts/comments'
import type { CommentBody } from '@/shared/pt/comment-schema'

import { idStr } from '@/shared/utils/tools'

export type FilterStatus = 'all' | 'pending' | 'approved'

// `FilterItem` is the shape Base UI Combobox treats specially: when an
// `items` array contains `{ value, label }` objects, `label` is auto-used in
// `Combobox.Value` / `Combobox.Input` and `value` is auto-used for the
// controlled `value` lookup.
export interface FilterItem {
  value: string
  label: string
}

export interface StatusCounts {
  all: number
  pending: number
  approved: number
}

interface CommentsState {
  comments: AdminComment[]
  total: number
  hasMore: boolean
  currentPage: number
  pageSize: number
  filterStatus: FilterStatus
  filterPage: FilterItem | null
  filterAuthor: FilterItem | null
  statusCounts: StatusCounts
}

type CommentsAction =
  | {
      type: 'loaded'
      comments: AdminComment[]
      total: number
      hasMore: boolean
      statusCounts: StatusCounts
    }
  | { type: 'removeComment'; id: string }
  | { type: 'approveComment'; id: string }
  | { type: 'updateCommentContent'; id: string; body: CommentBody }
  | { type: 'setFilterStatus'; value: FilterStatus }
  | { type: 'setFilterPage'; value: FilterItem | null }
  | { type: 'setFilterAuthor'; value: FilterItem | null }
  | { type: 'renameFilterAuthor'; label: string }
  | { type: 'renameFilterPage'; label: string }
  | { type: 'setPageSize'; value: number }
  | { type: 'setCurrentPage'; value: number }

function commentsReducer(state: CommentsState, action: CommentsAction): CommentsState {
  switch (action.type) {
    case 'loaded':
      return {
        ...state,
        comments: action.comments,
        total: action.total,
        hasMore: action.hasMore,
        statusCounts: action.statusCounts,
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
    case 'setFilterStatus':
      return { ...state, filterStatus: action.value, currentPage: 0 }
    case 'setFilterPage':
      return { ...state, filterPage: action.value, currentPage: 0 }
    case 'setFilterAuthor':
      return { ...state, filterAuthor: action.value, currentPage: 0 }
    case 'renameFilterAuthor':
      if (!state.filterAuthor) {
        return state
      }
      return { ...state, filterAuthor: { ...state.filterAuthor, label: action.label } }
    case 'renameFilterPage':
      if (!state.filterPage) {
        return state
      }
      return { ...state, filterPage: { ...state.filterPage, label: action.label } }
    case 'setPageSize':
      return { ...state, pageSize: action.value, currentPage: 0 }
    case 'setCurrentPage':
      return { ...state, currentPage: action.value }
  }
}

export interface UseCommentsControllerOptions {
  initialAuthorId: string
  initialPageKey: string
  initialStatus: FilterStatus
}

export function useCommentsController({
  initialAuthorId,
  initialPageKey,
  initialStatus,
}: UseCommentsControllerOptions) {
  const [state, dispatch] = useReducer(commentsReducer, {
    comments: [],
    total: 0,
    hasMore: false,
    currentPage: 0,
    pageSize: 10,
    filterStatus: initialStatus,
    filterPage: initialPageKey ? { value: initialPageKey, label: initialPageKey } : null,
    filterAuthor: initialAuthorId ? { value: initialAuthorId, label: initialAuthorId } : null,
    statusCounts: { all: 0, pending: 0, approved: 0 },
  })

  return {
    state,
    dispatch,
    filterPageKey: state.filterPage?.value ?? '',
    filterAuthorId: state.filterAuthor?.value ?? '',
  }
}
