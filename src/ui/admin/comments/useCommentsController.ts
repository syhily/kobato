import { useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState, type Dispatch } from 'react'
import { useSearchParams } from 'react-router'

import type { AdminCommentWire as AdminComment } from '@/shared/contracts/comments'
import type { CommentEditorState } from '@/shared/lexical/comment-schema'
import type { ActiveFilter, FilterPillsAction } from '@/ui/admin/shared/filterPillsReducer'

import { orpc } from '@/client/api/client'
import { orpcQuery } from '@/client/api/orpc-query'
import { onMutationError } from '@/client/lib/toast-api-error'
import { idStr } from '@/shared/utils/tools'
import { unsafeCast } from '@/shared/utils/unsafe-cast'
import {
  type CommentFilterFieldKey,
  type CommentsFilterQuery,
  STATUS_OPTIONS,
  isTextFilterOperator,
  textFilterLabel,
} from '@/ui/admin/comments/filter-fields'
import { type ConfirmState } from '@/ui/admin/shared/ConfirmDialog'
import {
  DEFAULT_SINGLE_DATE_OPERATOR,
  isSingleDateFilterOperator,
  singleDateFilterLabel,
} from '@/ui/admin/shared/date-filter'
import { useAdminInfiniteList } from '@/ui/admin/shared/useAdminInfiniteList'
import { type I18nValue, useI18n } from '@/ui/lib/I18nProvider'

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

// Cache patches; `total` stays stale on removal — the next page load re-syncs it.
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

export function updateCommentBodyInPages(
  data: AdminCommentsData,
  id: string,
  body: CommentEditorState,
  content: string | null,
): AdminCommentsData {
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      comments: page.comments.map((comment) => (idStr(comment.id) === id ? { ...comment, body, content } : comment)),
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

// View-owned editor intents (edit / reply / edit-user); everything else on the actions object is controller-owned.
export interface CommentIntents {
  edit(comment: AdminComment): void
  reply(comment: AdminComment): void
  editUser(comment: AdminComment): void
}

// The single comment-actions surface handed to `AdminCommentRow`; triggers lead through their confirm dialog first.
export interface CommentActions extends CommentIntents {
  approve(comment: AdminComment): void
  remove(comment: AdminComment): void
  approveDeletion(comment: AdminComment): void
  rejectDeletion(comment: AdminComment): void
  filterByPage(pageKey: string, pageTitle: string): void
  filterByAuthor(userId: string, name: string): void
  /** Per-comment pending gates: mutations are shared, so a button disables only while its comment is in flight. */
  isApproving(comment: AdminComment): boolean
  isRemoving(comment: AdminComment): boolean
  isResolvingDeletion(comment: AdminComment): boolean
}

// Inverse of the URL write-back; intentionally lenient — a hand-edited URL with invalid values falls back to defaults.
export function parseCommentFiltersFromSearchParams(
  searchParams: URLSearchParams,
  t: I18nValue['t'],
): ActiveFilter<CommentFilterFieldKey>[] {
  const initialFilters: ActiveFilter<CommentFilterFieldKey>[] = []

  const status = searchParams.get('status')
  if (status && status !== 'all') {
    const statusOption = STATUS_OPTIONS.find((option) => option.value === status)
    initialFilters.push({
      field: 'status',
      value: status,
      label: statusOption ? t(statusOption.labelId) : status,
    })
  }

  const pageKey = searchParams.get('pageKey')
  if (pageKey) {
    initialFilters.push({ field: 'page', value: pageKey, label: pageKey })
  }

  const userId = searchParams.get('userId')
  if (userId) {
    initialFilters.push({ field: 'author', value: userId, label: userId })
  }

  const q = searchParams.get('q')
  const matchRaw = searchParams.get('match')
  if (q) {
    const op = isTextFilterOperator(matchRaw) ? matchRaw : 'contains'
    const value = JSON.stringify({ value: q, op })
    initialFilters.push({ field: 'text', value, label: textFilterLabel({ value: q, op }, t) })
  }

  const date = searchParams.get('date')
  const dateOp = searchParams.get('dateOp')
  if (date && isSingleDateFilterOperator(dateOp)) {
    const value = JSON.stringify({ date, op: dateOp })
    initialFilters.push({ field: 'date', value, label: singleDateFilterLabel({ date, op: dateOp }, t) })
  } else if (date) {
    // Partial date URL — pair with the default operator (Ghost's "on or before").
    const op = isSingleDateFilterOperator(dateOp) ? dateOp : DEFAULT_SINGLE_DATE_OPERATOR
    const value = JSON.stringify({ date, op })
    initialFilters.push({ field: 'date', value, label: singleDateFilterLabel({ date, op }, t) })
  }

  return initialFilters
}

export interface UseCommentsControllerOptions {
  /** Live pill state, owned by the view's `useFilterPills`, which also produced `queryInput`. */
  filters: ActiveFilter<CommentFilterFieldKey>[]
  dispatch: Dispatch<FilterPillsAction<CommentFilterFieldKey>>
  queryInput: CommentsFilterQuery
  intents: CommentIntents
}

export function useCommentsController({ filters, dispatch, queryInput, intents }: UseCommentsControllerOptions) {
  const { t } = useI18n()
  const queryClient = useQueryClient()

  // Mirror active filters into the URL (debounced — text/date edits dispatch per keystroke) so a filtered view stays shareable.
  const [searchParams, setSearchParams] = useSearchParams()
  const urlSyncTimerRef = useRef<number | null>(null)
  // Params string last consumed or produced; a mismatch means Back/Forward — the URL reseeds the pills.
  const consumedParamsRef = useRef<string | null>(null)
  useEffect(() => {
    const current = searchParams.toString()
    if (consumedParamsRef.current === current) {
      return
    }
    const isMount = consumedParamsRef.current === null
    consumedParamsRef.current = current
    if (isMount) {
      // The route already seeded the pills from this URL.
      return
    }
    const restored = parseCommentFiltersFromSearchParams(searchParams, t)
    dispatch({ type: 'clearFilters' })
    for (const filter of restored) {
      dispatch({ type: 'addFilter', field: filter.field, value: filter.value, label: filter.label })
    }
  }, [searchParams, dispatch, t])
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
            const range = unsafeCast<{ value?: string; op?: string }>(JSON.parse(filter.value))
            if (range.value) {
              next.set('q', range.value)
              if (range.op) {
                next.set('match', range.op)
              }
            }
          } catch {
            // ignore malformed pill value
          }
        } else if (filter.field === 'date' && filter.value) {
          try {
            const range = unsafeCast<{ date?: string; op?: string }>(JSON.parse(filter.value))
            if (range.date) {
              next.set('date', range.date)
            }
            if (range.op) {
              next.set('dateOp', range.op)
            }
          } catch {
            // ignore malformed pill value
          }
        }
      }
      if (next.toString() !== searchParams.toString()) {
        // Record the write so the reseed effect above recognizes it as our own.
        consumedParamsRef.current = next.toString()
        setSearchParams(next, { replace: true, preventScrollReset: true })
      }
    }, URL_SYNC_DEBOUNCE_MS)
    return () => {
      if (urlSyncTimerRef.current !== null) {
        window.clearTimeout(urlSyncTimerRef.current)
      }
    }
  }, [filters, setSearchParams, searchParams])

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
      ...queryInput,
    }),
    selectRows: (page) => page.comments,
    noun: 'admin.list.noun.comments',
  })
  const statusCounts = firstPage?.statusCounts ?? ZERO_STATUS_COUNTS

  // Rewrite the cached list pages in place after a server-side action instead of refetching.
  const approveComment = useCallback(
    (id: string) => patchPages((data) => approveCommentInPages(data, id)),
    [patchPages],
  )
  const removeComment = useCallback(
    (id: string) => patchPages((data) => removeCommentFromPages(data, id)),
    [patchPages],
  )
  const updateCommentBody = useCallback(
    (id: string, body: CommentEditorState, content: string | null) =>
      patchPages((data) => updateCommentBodyInPages(data, id, body, content)),
    [patchPages],
  )
  const clearCommentDeleteRequest = useCallback(
    (id: string, isPending: boolean) => patchPages((data) => clearDeleteRequestInPages(data, id, isPending)),
    [patchPages],
  )

  // Full refresh after mutations the local patches can't model (user edits, replies).
  const invalidateList = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: orpcQuery.admin.comments.loadAll.key() })
  }, [queryClient])

  // Each mutation owns its confirm-dialog state here; the cache patch rides on success.
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const closeConfirm = useCallback(() => setConfirm(null), [])

  const approveMutation = useMutation({
    ...orpcQuery.admin.comments.approve.mutationOptions(),
    onSuccess: (_result, variables) => approveComment(variables.commentId),
    onError: onMutationError('admin.toast.commentApproveFailed', t),
  })
  const deleteMutation = useMutation({
    ...orpcQuery.admin.comments.delete.mutationOptions(),
    onSuccess: (_result, variables) => removeComment(variables.commentId),
    onError: onMutationError('admin.toast.commentDeleteFailed', t),
  })
  // Shared by approve-deletion / reject-deletion — the per-call `onSuccess` captures the comment for the reject path's count fixup.
  const resolveDeletionMutation = useMutation({
    ...orpcQuery.admin.comments.approveCommentDeletion.mutationOptions(),
    onError: onMutationError('admin.toast.commentDeleteRequestFailed', t),
  })

  const actions: CommentActions = {
    ...intents,
    approve: (comment) =>
      setConfirm({
        title: t('admin.comments.confirm.approveTitle'),
        description: t('admin.comments.confirm.approveBody'),
        actionLabel: t('admin.comments.row.approve'),
        destructive: false,
        onConfirm: () => approveMutation.mutate({ commentId: idStr(comment.id) }),
      }),
    remove: (comment) =>
      setConfirm({
        title: t('admin.comments.confirm.deleteTitle'),
        description: t('admin.comments.confirm.deleteBody'),
        actionLabel: t('common.action.delete'),
        destructive: true,
        onConfirm: () => deleteMutation.mutate({ commentId: idStr(comment.id) }),
      }),
    approveDeletion: (comment) =>
      setConfirm({
        title: t('admin.comments.confirm.approveDeletionTitle'),
        description: t('admin.comments.confirm.approveDeletionBody'),
        actionLabel: t('admin.comments.row.approveDeletion'),
        destructive: true,
        onConfirm: () =>
          resolveDeletionMutation.mutate(
            { commentId: idStr(comment.id), approve: true },
            { onSuccess: () => removeComment(idStr(comment.id)) },
          ),
      }),
    rejectDeletion: (comment) =>
      setConfirm({
        title: t('admin.comments.confirm.rejectDeletionTitle'),
        description: t('admin.comments.confirm.rejectDeletionBody'),
        actionLabel: t('admin.comments.row.rejectDeletion'),
        destructive: false,
        onConfirm: () =>
          resolveDeletionMutation.mutate(
            { commentId: idStr(comment.id), approve: false },
            { onSuccess: () => clearCommentDeleteRequest(idStr(comment.id), comment.isPending === true) },
          ),
      }),
    filterByPage: (pageKey, pageTitle) => {
      dispatch({ type: 'addFilter', field: 'page', value: pageKey, label: pageTitle })
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }
    },
    filterByAuthor: (userId, name) => {
      dispatch({ type: 'addFilter', field: 'author', value: userId, label: name })
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }
    },
    isApproving: (comment) => approveMutation.isPending && approveMutation.variables?.commentId === idStr(comment.id),
    isRemoving: (comment) => deleteMutation.isPending && deleteMutation.variables?.commentId === idStr(comment.id),
    isResolvingDeletion: (comment) =>
      resolveDeletionMutation.isPending && resolveDeletionMutation.variables?.commentId === idStr(comment.id),
  }

  return {
    comments,
    total,
    statusCounts,
    hasMore: hasNextPage,
    isLoading,
    isFetchingNextPage,
    sentinelRef,
    actions,
    confirm,
    closeConfirm,
    updateCommentBody,
    invalidateList,
  }
}
