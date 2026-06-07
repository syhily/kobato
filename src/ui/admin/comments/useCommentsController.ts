import { useMemo, useReducer } from 'react'

import type { CommentBody } from '@/shared/pt/comment-schema'
import type { AdminCommentWire as AdminComment } from '@/shared/types/comments'

import { idStr } from '@/shared/utils/tools'

export type FilterStatus = 'all' | 'pending' | 'approved'

export type FilterFieldKey = 'status' | 'page' | 'author' | 'text' | 'date'

export type DateFilterOperator = 'is-less' | 'is-or-less' | 'is-greater' | 'is-or-greater'

export const DATE_FILTER_OPERATORS: readonly { value: DateFilterOperator; label: string }[] = [
  { value: 'is-less', label: '之前' },
  { value: 'is-or-less', label: '不晚于' },
  { value: 'is-greater', label: '之后' },
  { value: 'is-or-greater', label: '不早于' },
] as const

export const DEFAULT_DATE_OPERATOR: DateFilterOperator = 'is-or-less'

export function isDateFilterOperator(value: unknown): value is DateFilterOperator {
  return value === 'is-less' || value === 'is-or-less' || value === 'is-greater' || value === 'is-or-greater'
}

export type TextFilterOperator = 'contains' | 'does-not-contain'

export const TEXT_FILTER_OPERATORS: readonly { value: TextFilterOperator; label: string }[] = [
  { value: 'contains', label: '包含' },
  { value: 'does-not-contain', label: '不包含' },
] as const

export const DEFAULT_TEXT_OPERATOR: TextFilterOperator = 'contains'

export function isTextFilterOperator(value: unknown): value is TextFilterOperator {
  return value === 'contains' || value === 'does-not-contain'
}

export interface ActiveFilter {
  field: FilterFieldKey
  value: string
  label: string
}

export interface FilterItem {
  value: string
  label: string
}

export interface DateFilterValue {
  date: string
  op: DateFilterOperator
}

export function parseDateFilter(value: string | undefined): DateFilterValue | null {
  if (!value) {
    return null
  }
  try {
    const parsed = JSON.parse(value) as unknown
    if (!parsed || typeof parsed !== 'object') {
      return null
    }
    const date = typeof (parsed as { date?: unknown }).date === 'string' ? (parsed as { date: string }).date : ''
    const op = (parsed as { op?: unknown }).op
    if (!date || !isDateFilterOperator(op)) {
      return null
    }
    return { date, op }
  } catch {
    return null
  }
}

export function dateFilterLabel(value: DateFilterValue): string {
  const opLabel = DATE_FILTER_OPERATORS.find((o) => o.value === value.op)?.label ?? ''
  return `${opLabel} ${value.date}`
}

export function resolveDateFilterBounds(value: DateFilterValue | null): {
  after: string | undefined
  before: string | undefined
} {
  if (!value) {
    return { after: undefined, before: undefined }
  }
  const start = new Date(value.date)
  if (Number.isNaN(start.getTime())) {
    return { after: undefined, before: undefined }
  }
  start.setHours(0, 0, 0, 0)
  const end = new Date(value.date)
  end.setHours(23, 59, 59, 999)
  const startIso = start.toISOString()
  const endIso = end.toISOString()
  switch (value.op) {
    case 'is-less':
      return { after: undefined, before: startIso }
    case 'is-or-less':
      return { after: undefined, before: endIso }
    case 'is-greater':
      return { after: endIso, before: undefined }
    case 'is-or-greater':
      return { after: startIso, before: undefined }
  }
}

export interface TextFilterValue {
  op: TextFilterOperator
  value: string
}

export function parseTextFilter(value: string | undefined): TextFilterValue | null {
  if (!value) {
    return null
  }
  try {
    const parsed = JSON.parse(value) as unknown
    if (!parsed || typeof parsed !== 'object') {
      return null
    }
    const op = (parsed as { op?: unknown }).op
    const text = (parsed as { value?: unknown }).value
    if (!isTextFilterOperator(op) || typeof text !== 'string') {
      return null
    }
    return { op, value: text }
  } catch {
    return null
  }
}

export function textFilterLabel(v: TextFilterValue): string {
  const opLabel = TEXT_FILTER_OPERATORS.find((o) => o.value === v.op)?.label ?? ''
  const trimmed = v.value.trim()
  const excerpt = trimmed.length > 8 ? `${trimmed.slice(0, 8)}…` : trimmed
  return excerpt ? `${opLabel}「${excerpt}」` : opLabel
}

export interface StatusCounts {
  all: number
  pending: number
  approved: number
}

const PAGE_SIZE = 10

export interface CommentsState {
  comments: AdminComment[]
  total: number
  filters: ActiveFilter[]
  statusCounts: StatusCounts
}

export type CommentsAction =
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

export function commentsReducer(state: CommentsState, action: CommentsAction): CommentsState {
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
      return { ...state, filters: [...next, { field: action.field, value: action.value, label: action.label }] }
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

  const textRange = useMemo(() => (textFilter ? parseTextFilter(textFilter.value) : null), [textFilter])
  const dateRange = useMemo(() => (dateFilter ? parseDateFilter(dateFilter.value) : null), [dateFilter])
  const dateBounds = useMemo(() => resolveDateFilterBounds(dateRange), [dateRange])

  return {
    state,
    dispatch,
    pageSize: PAGE_SIZE,
    hasMore: state.comments.length < state.total,
    filterStatus: (statusFilter?.value ?? 'all') as FilterStatus,
    filterPageKey: pageFilter?.value ?? '',
    filterAuthorId: authorFilter?.value ?? '',
    filterText: textRange,
    filterDateRange: dateRange,
    filterCreatedAfter: dateBounds.after,
    filterCreatedBefore: dateBounds.before,
  }
}
