import { useQueryClient, type InfiniteData } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import { useSearchParams } from 'react-router'

import type { CommentBody } from '@/shared/pt/comment-schema'

import { orpc } from '@/client/api/client'
import { orpcQuery } from '@/client/api/orpc-query'
import { idStr } from '@/shared/utils/tools'
import { unsafeCast } from '@/shared/utils/unsafe-cast'
import { parseSingleDateFilter, resolveSingleDateFilterBounds } from '@/ui/admin/shared/date-filter'
import { filterPillsReducer, type ActiveFilter as GenericActiveFilter } from '@/ui/admin/shared/filterPillsReducer'
import { useAdminInfiniteList } from '@/ui/admin/shared/useAdminInfiniteList'

export type FilterStatus = 'all' | 'pending' | 'approved' | 'deleteRequested'

export type FilterFieldKey = 'status' | 'page' | 'author' | 'text' | 'date'

function isFilterStatus(value: unknown): value is FilterStatus {
  return value === 'all' || value === 'pending' || value === 'approved' || value === 'deleteRequested'
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

export type ActiveFilter = GenericActiveFilter<FilterFieldKey>

export interface FilterItem {
  value: string
  label: string
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
  deleteRequested: number
}

const PAGE_SIZE = 10
const URL_SYNC_DEBOUNCE_MS = 300

export type AdminCommentsPage = Awaited<ReturnType<typeof orpc.admin.comments.loadAll>>
export type AdminCommentsData = InfiniteData<AdminCommentsPage, number>

const ZERO_STATUS_COUNTS: StatusCounts = { all: 0, pending: 0, approved: 0, deleteRequested: 0 }

// Local-mutation helpers: after an admin action (approve / delete / edit /
// delete-request resolution) succeeds server-side, the view patches the cached
// list pages in place instead of refetching. `total` is deliberately left
// untouched on removal — the next page load re-syncs it.

export function removeCommentFromPages(data: AdminCommentsData, id: string): AdminCommentsData {
  const removed = data.pages.flatMap((page) => page.comments).find((comment) => idStr(comment.id) === id)
  return {
    ...data,
    pages: data.pages.map((page) => {
      const statusCounts = { ...page.statusCounts, all: Math.max(0, page.statusCounts.all - 1) }
      if (removed) {
        if (removed.deleteRequestedAt !== null) {
          statusCounts.deleteRequested = Math.max(0, statusCounts.deleteRequested - 1)
        } else if (removed.isPending) {
          statusCounts.pending = Math.max(0, statusCounts.pending - 1)
        } else {
          statusCounts.approved = Math.max(0, statusCounts.approved - 1)
        }
      }
      return {
        ...page,
        comments: page.comments.filter((comment) => idStr(comment.id) !== id),
        statusCounts,
      }
    }),
  }
}

export function approveCommentInPages(data: AdminCommentsData, id: string): AdminCommentsData {
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      comments: page.comments.map((comment) => (idStr(comment.id) === id ? { ...comment, isPending: false } : comment)),
      statusCounts: {
        ...page.statusCounts,
        pending: Math.max(0, page.statusCounts.pending - 1),
        approved: page.statusCounts.approved + 1,
      },
    })),
  }
}

export function updateCommentBodyInPages(data: AdminCommentsData, id: string, body: CommentBody): AdminCommentsData {
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      comments: page.comments.map((comment) => (idStr(comment.id) === id ? { ...comment, body } : comment)),
    })),
  }
}

export function clearDeleteRequestInPages(data: AdminCommentsData, id: string, isPending: boolean): AdminCommentsData {
  return {
    ...data,
    pages: data.pages.map((page) => {
      const statusCounts = {
        ...page.statusCounts,
        deleteRequested: Math.max(0, page.statusCounts.deleteRequested - 1),
      }
      if (isPending) {
        statusCounts.pending = page.statusCounts.pending + 1
      } else {
        statusCounts.approved = page.statusCounts.approved + 1
      }
      return {
        ...page,
        comments: page.comments.map((comment) =>
          idStr(comment.id) === id ? { ...comment, deleteRequestedAt: null } : comment,
        ),
        statusCounts,
      }
    }),
  }
}

export interface UseCommentsControllerOptions {
  initialFilters: ActiveFilter[]
}

export function useCommentsController({ initialFilters }: UseCommentsControllerOptions) {
  const queryClient = useQueryClient()
  const [filters, dispatch] = useReducer(filterPillsReducer<FilterFieldKey>, initialFilters)

  const statusFilter = filters.find((f) => f.field === 'status')
  const pageFilter = filters.find((f) => f.field === 'page')
  const authorFilter = filters.find((f) => f.field === 'author')
  const textFilter = filters.find((f) => f.field === 'text')
  const dateFilter = filters.find((f) => f.field === 'date')

  const filterText = useMemo(() => (textFilter ? parseTextFilter(textFilter.value) : null), [textFilter])
  const filterDateRange = useMemo(() => (dateFilter ? parseSingleDateFilter(dateFilter.value) : null), [dateFilter])
  const dateBounds = useMemo(() => resolveSingleDateFilterBounds(filterDateRange), [filterDateRange])

  const filterStatus: FilterStatus = isFilterStatus(statusFilter?.value) ? statusFilter.value : 'all'
  const filterPageKey = pageFilter?.value ?? ''
  const filterAuthorId = authorFilter?.value ?? ''
  const filterCreatedAfter = dateBounds.after
  const filterCreatedBefore = dateBounds.before

  // Mirror the active filters into the URL so a filtered view stays shareable.
  // Debounced — text/date edits dispatch on every keystroke; the URL settles
  // once the user pauses.
  const [searchParams, setSearchParams] = useSearchParams()
  const urlSyncTimerRef = useRef<number | null>(null)
  useEffect(() => {
    if (urlSyncTimerRef.current !== null) {
      window.clearTimeout(urlSyncTimerRef.current)
    }
    urlSyncTimerRef.current = window.setTimeout(() => {
      const next = new URLSearchParams()
      for (const filter of filters) {
        if (filter.field === 'status' && filter.value !== 'all') {
          next.set('status', filter.value)
        } else if (filter.field === 'page' && filter.value) {
          next.set('pageKey', filter.value)
        } else if (filter.field === 'author' && filter.value) {
          next.set('userId', filter.value)
        } else if (filter.field === 'text' && filter.value) {
          try {
            // parsed JSON validated immediately below
            const range = unsafeCast<{ value?: string; op?: string }>(JSON.parse(filter.value))
            if (range.value) {
              next.set('q', range.value)
              if (range.op) {
                next.set('match', range.op)
              }
            }
          } catch {
            // ignore malformed legacy value
          }
        } else if (filter.field === 'date' && filter.value) {
          try {
            // parsed JSON validated immediately below
            const range = unsafeCast<{ date?: string; op?: string }>(JSON.parse(filter.value))
            if (range.date) {
              next.set('date', range.date)
            }
            if (range.op) {
              next.set('dateOp', range.op)
            }
          } catch {
            // ignore malformed legacy value
          }
        }
      }
      if (next.toString() !== searchParams.toString()) {
        setSearchParams(next, { replace: true, preventScrollReset: true })
      }
    }, URL_SYNC_DEBOUNCE_MS)
    return () => {
      if (urlSyncTimerRef.current !== null) {
        window.clearTimeout(urlSyncTimerRef.current)
      }
    }
  }, [filters, setSearchParams, searchParams])

  const textQuery = filterText?.value ?? ''
  const textMatch = filterText?.value ? filterText.op : ''
  const createdAfter = filterCreatedAfter ?? ''
  const createdBefore = filterCreatedBefore ?? ''
  const {
    rows: comments,
    total,
    firstPage,
    isLoading,
    hasNextPage,
    isFetchingNextPage,
    sentinelRef,
    patchPages,
  } = useAdminInfiniteList({
    namespace: orpcQuery.admin.comments.loadAll,
    pageSize: PAGE_SIZE,
    buildInput: (offset) => ({
      offset,
      limit: PAGE_SIZE,
      ...(filterPageKey ? { pageKey: filterPageKey } : {}),
      ...(filterAuthorId ? { userId: filterAuthorId } : {}),
      ...(filterStatus !== 'all' ? { status: filterStatus } : {}),
      // `textQuery`/`textMatch` are truthy together; guarding on both
      // narrows `match` to the contract's operator union (drops '').
      ...(textQuery && textMatch ? { q: textQuery, match: textMatch } : {}),
      ...(createdAfter ? { createdAfter } : {}),
      ...(createdBefore ? { createdBefore } : {}),
    }),
    selectRows: (page) => page.comments,
    noun: '评论',
  })
  const statusCounts = firstPage?.statusCounts ?? ZERO_STATUS_COUNTS

  // After a server-side admin action succeeds, rewrite the cached list pages
  // in place instead of refetching — the helpers above stay pure; `patchPages`
  // owns the query key and the `setQueryData` call.
  const approveComment = useCallback(
    (id: string) => patchPages((data) => approveCommentInPages(data, id)),
    [patchPages],
  )
  const removeComment = useCallback(
    (id: string) => patchPages((data) => removeCommentFromPages(data, id)),
    [patchPages],
  )
  const updateCommentBody = useCallback(
    (id: string, body: CommentBody) => patchPages((data) => updateCommentBodyInPages(data, id, body)),
    [patchPages],
  )
  const clearCommentDeleteRequest = useCallback(
    (id: string, isPending: boolean) => patchPages((data) => clearDeleteRequestInPages(data, id, isPending)),
    [patchPages],
  )

  // Full refresh after mutations the local patches can't model (user edits,
  // replies). The procedure-level key covers every cached `loadAll` input;
  // only the active combination has a live query, so exactly that one refetches.
  const invalidateList = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: orpcQuery.admin.comments.loadAll.key() })
  }, [queryClient])

  return {
    filters,
    dispatch,
    comments,
    total,
    statusCounts,
    hasMore: hasNextPage,
    isLoading,
    isFetchingNextPage,
    sentinelRef,
    approveComment,
    removeComment,
    updateCommentBody,
    clearCommentDeleteRequest,
    invalidateList,
    filterStatus,
    filterPageKey,
    filterAuthorId,
    filterText,
    filterDateRange,
    filterCreatedAfter,
    filterCreatedBefore,
  }
}
