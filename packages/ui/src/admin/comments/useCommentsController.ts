import type { AdminCommentWire as AdminComment } from '@kobato/shared/contracts/comments'
import type { LexicalCommentBody } from '@kobato/shared/lexical/comment-schema'
import type { ActiveFilter, FilterPillsAction } from '@kobato/ui/admin/shared/filterPillsReducer'

import { orpc } from '@kobato/client/api/client'
import { orpcQuery } from '@kobato/client/api/orpc-query'
import { toastApiError } from '@kobato/client/lib/toast-api-error'
import { idStr } from '@kobato/shared/utils/tools'
import { unsafeCast } from '@kobato/shared/utils/unsafe-cast'
import {
  type CommentFilterFieldKey,
  type CommentsFilterQuery,
  isTextFilterOperator,
  textFilterLabel,
} from '@kobato/ui/admin/comments/filter-fields'
import { type ConfirmState } from '@kobato/ui/admin/shared/ConfirmDialog'
import {
  DEFAULT_SINGLE_DATE_OPERATOR,
  isSingleDateFilterOperator,
  singleDateFilterLabel,
} from '@kobato/ui/admin/shared/date-filter'
import { useAdminInfiniteList } from '@kobato/ui/admin/shared/useAdminInfiniteList'
import { useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState, type Dispatch } from 'react'
import { useSearchParams } from 'react-router'

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

export function updateCommentBodyInPages(
  data: AdminCommentsData,
  id: string,
  body: LexicalCommentBody,
): AdminCommentsData {
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

// View-owned editor intents: the edit / reply / edit-user dialogs live in
// the view, so the view wires these three slots. Everything else on the
// actions object is owned by the controller (mutations, confirm dialogs,
// cache patches, filter shortcuts).
export interface CommentIntents {
  edit(comment: AdminComment): void
  reply(comment: AdminComment): void
  editUser(comment: AdminComment): void
}

// The single comment-actions surface handed to `AdminCommentRow`. Mutation
// triggers lead through their confirm dialog first — `approve(comment)`
// opens the 通过 confirm, and confirming fires the mutation, exactly the
// flow the view used to choreograph by hand.
export interface CommentActions extends CommentIntents {
  /** 通过 — confirm, then approve the pending comment. */
  approve(comment: AdminComment): void
  /** 删除评论 — confirm, then delete the comment. */
  remove(comment: AdminComment): void
  /** 同意删除 — confirm, then approve the author's delete request. */
  approveDeletion(comment: AdminComment): void
  /** 拒绝删除 — confirm, then reject the author's delete request. */
  rejectDeletion(comment: AdminComment): void
  filterByPage(pageKey: string, pageTitle: string): void
  filterByAuthor(userId: string, name: string): void
  /** Per-comment pending gates — the mutations are shared across rows, so
   *  a button disables only while ITS comment is in flight. */
  isApproving(comment: AdminComment): boolean
  isRemoving(comment: AdminComment): boolean
  isResolvingDeletion(comment: AdminComment): boolean
}

// Build the filter list from a `URLSearchParams` snapshot — the inverse of
// the write-back inside the controller below. Used for the route's mount
// seed (shared URLs) and for the controller's Back/Forward reseed, so both
// directions agree on the URL shape. Intentionally lenient — invalid
// values fall back to a sensible default rather than throwing, so a
// hand-edited URL never bricks the page.
export function parseCommentFiltersFromSearchParams(
  searchParams: URLSearchParams,
): ActiveFilter<CommentFilterFieldKey>[] {
  const initialFilters: ActiveFilter<CommentFilterFieldKey>[] = []

  const status = searchParams.get('status')
  if (status && status !== 'all') {
    const statusLabel: Record<string, string> = {
      pending: '待审核',
      approved: '已审核',
      deleteRequested: '申请删除',
    }
    initialFilters.push({ field: 'status', value: status, label: statusLabel[status] ?? status })
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
    initialFilters.push({ field: 'text', value, label: textFilterLabel({ value: q, op }) })
  }

  const date = searchParams.get('date')
  const dateOp = searchParams.get('dateOp')
  if (date && isSingleDateFilterOperator(dateOp)) {
    const value = JSON.stringify({ date, op: dateOp })
    initialFilters.push({ field: 'date', value, label: singleDateFilterLabel({ date, op: dateOp }) })
  } else if (date) {
    // Partial date URL — fall back to the default operator so the
    // chip stays consistent with the picker, which always pairs a
    // date with an operator. `dateOp` may be missing or invalid;
    // `DEFAULT_SINGLE_DATE_OPERATOR` matches Ghost's "on or before" default.
    const op = isSingleDateFilterOperator(dateOp) ? dateOp : DEFAULT_SINGLE_DATE_OPERATOR
    const value = JSON.stringify({ date, op })
    initialFilters.push({ field: 'date', value, label: singleDateFilterLabel({ date, op }) })
  }

  return initialFilters
}

export interface UseCommentsControllerOptions {
  /** Live pill state — owned by the view's `useFilterPills`, which also
   *  produced `queryInput` (the merged per-field `toQuery` patch). */
  filters: ActiveFilter<CommentFilterFieldKey>[]
  dispatch: Dispatch<FilterPillsAction<CommentFilterFieldKey>>
  queryInput: CommentsFilterQuery
  intents: CommentIntents
}

export function useCommentsController({ filters, dispatch, queryInput, intents }: UseCommentsControllerOptions) {
  const queryClient = useQueryClient()

  // Mirror the active filters into the URL so a filtered view stays shareable.
  // Debounced — text/date edits dispatch on every keystroke; the URL settles
  // once the user pauses.
  const [searchParams, setSearchParams] = useSearchParams()
  const urlSyncTimerRef = useRef<number | null>(null)
  // The params string this controller last consumed (mount / popstate
  // reseed) or produced (the write-back below). A `searchParams` change
  // that doesn't match it came from outside — browser Back/Forward — so
  // the URL becomes the source of truth again and the pills reseed from it
  // instead of the stale pills being written back over the restored URL.
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
    const restored = parseCommentFiltersFromSearchParams(searchParams)
    dispatch({ type: 'clearFilters' })
    for (const filter of restored) {
      dispatch({ type: 'addFilter', field: filter.field, value: filter.value, label: filter.label })
    }
  }, [searchParams, dispatch])
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
        // Record the write so the reseed effect above recognizes this
        // searchParams change as our own and leaves the pills alone.
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
    (id: string, body: LexicalCommentBody) => patchPages((data) => updateCommentBodyInPages(data, id, body)),
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

  // Comment actions: each mutation owns its confirm-dialog state here, and
  // its cache patch rides on success — the row stays presentational.
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const closeConfirm = useCallback(() => setConfirm(null), [])

  const approveMutation = useMutation({
    ...orpcQuery.admin.comments.approve.mutationOptions(),
    onSuccess: (_result, variables) => approveComment(variables.commentId),
  })
  const deleteMutation = useMutation({
    ...orpcQuery.admin.comments.delete.mutationOptions(),
    onSuccess: (_result, variables) => removeComment(variables.commentId),
  })
  // Shared by 同意删除 / 拒绝删除 — the per-call `onSuccess` captures the
  // comment so the reject path keeps its `isPending` count fixup.
  const resolveDeletionMutation = useMutation({
    ...orpcQuery.admin.comments.approveCommentDeletion.mutationOptions(),
    onError: (error) => {
      toastApiError(error, '处理删除申请失败')
    },
  })

  const actions: CommentActions = {
    ...intents,
    approve: (comment) =>
      setConfirm({
        title: '审核通过该评论？',
        description: '审核通过后评论会立即对所有访客可见，并向作者发送通知邮件。',
        actionLabel: '通过',
        destructive: false,
        onConfirm: () => approveMutation.mutate({ commentId: idStr(comment.id) }),
      }),
    remove: (comment) =>
      setConfirm({
        title: '删除该评论？',
        description: '此操作不可撤销，删除后评论从前后台彻底消失。',
        actionLabel: '删除',
        destructive: true,
        onConfirm: () => deleteMutation.mutate({ commentId: idStr(comment.id) }),
      }),
    approveDeletion: (comment) =>
      setConfirm({
        title: '同意删除该评论？',
        description: '同意后评论会被标记为已删除，并从前后台隐藏。',
        actionLabel: '同意删除',
        destructive: true,
        onConfirm: () =>
          resolveDeletionMutation.mutate(
            { commentId: idStr(comment.id), approve: true },
            { onSuccess: () => removeComment(idStr(comment.id)) },
          ),
      }),
    rejectDeletion: (comment) =>
      setConfirm({
        title: '拒绝删除申请？',
        description: '拒绝后该评论会恢复为正常状态，作者需要重新申请才能再次删除。',
        actionLabel: '拒绝删除',
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
