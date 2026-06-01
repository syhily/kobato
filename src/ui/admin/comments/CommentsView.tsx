import { LoaderIcon, SearchIcon } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'

import type { AdminCommentWire as AdminComment } from '@/shared/contracts/comments'
import type { ActiveFilter, FilterFieldKey, FilterItem } from '@/ui/admin/comments/useCommentsController'

import { orpc } from '@/client/api/client'
import { orpcQuery, useMutation, useQuery } from '@/client/api/query'
import { idStr } from '@/shared/utils/tools'
import { AdminCommentRow } from '@/ui/admin/comments/AdminCommentRow'
import { CommentsFilterBar } from '@/ui/admin/comments/CommentsFilterBar'
import { EditCommentDialog } from '@/ui/admin/comments/EditCommentDialog'
import { EditUserDialog } from '@/ui/admin/comments/EditUserDialog'
import { ReplyCommentDialog } from '@/ui/admin/comments/ReplyCommentDialog'
import { useCommentsController } from '@/ui/admin/comments/useCommentsController'
import { AdminListPage } from '@/ui/admin/shared/AdminListPage'
import { type ConfirmState, ConfirmDialog } from '@/ui/admin/shared/ConfirmDialog'
import { useDebouncedSearch } from '@/ui/admin/shared/useDebouncedSearch'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/ui/components/empty'
import { Skeleton } from '@/ui/components/skeleton'

const FILTER_QUERY_DEBOUNCE_MS = 250

export interface CommentsViewProps {
  currentUserName: string
  currentUserEmail: string
  initialFilters: ActiveFilter[]
}

export function CommentsView({ currentUserName, currentUserEmail, initialFilters }: CommentsViewProps) {
  const {
    state,
    dispatch,
    pageSize,
    hasMore,
    filterStatus,
    filterPageKey,
    filterAuthorId,
    filterText,
    filterCreatedAfter,
    filterCreatedBefore,
  } = useCommentsController({
    initialFilters,
  })

  // `loadAll` is a GET, but we wrap it in `useMutation` for
  // imperative control: `reload()` decides when to fire, and
  // `lastQueryKeyRef` dedupes repeat calls so the page doesn't
  // stack `加载评论列表失败` toasts when the user is exploring
  // filter combos. A `useQuery` would refetch on key change
  // automatically but wouldn't give us the callback wiring we
  // need for the dedup or the toast.
  const loadMutation = useMutation({
    ...orpcQuery.admin.comments.loadAll.mutationOptions(),
    onSuccess: (payload) => {
      dispatch({
        type: 'loaded',
        comments: payload.comments,
        total: payload.total,
        statusCounts: payload.statusCounts,
      })
    },
    onError: (error) => {
      toast.error('加载评论列表失败', { description: error.message })
    },
  })

  const [debouncedPageQuery, setDebouncedPageQuery] = useState('')
  const [, setPageQuery] = useDebouncedSearch({
    delayMs: FILTER_QUERY_DEBOUNCE_MS,
    onChange: (value) => setDebouncedPageQuery(value),
  })

  const [debouncedAuthorQuery, setDebouncedAuthorQuery] = useState('')
  const [, setAuthorQuery] = useDebouncedSearch({
    delayMs: FILTER_QUERY_DEBOUNCE_MS,
    onChange: (value) => setDebouncedAuthorQuery(value),
  })

  const { data: pagesData, isLoading: isPagesPending } = useQuery(
    orpcQuery.admin.comments.searchPages.queryOptions({
      input: debouncedPageQuery ? { q: debouncedPageQuery } : {},
    }),
  )

  const { data: authorsData, isLoading: isAuthorsPending } = useQuery(
    orpcQuery.admin.comments.searchAuthors.queryOptions({
      input: debouncedAuthorQuery ? { q: debouncedAuthorQuery } : {},
    }),
  )

  const authorInitial = initialFilters.find((f) => f.field === 'author')
  const { data: authorRehydrateData } = useQuery(
    orpcQuery.admin.comments.searchAuthors.queryOptions({
      input: authorInitial ? { ids: authorInitial.value } : {},
      enabled: !!authorInitial,
    }),
  )

  const pageInitial = initialFilters.find((f) => f.field === 'page')
  const { data: pageRehydrateData } = useQuery(
    orpcQuery.admin.comments.searchPages.queryOptions({
      input: pageInitial ? { key: pageInitial.value } : {},
      enabled: !!pageInitial,
    }),
  )

  const { mutate: loadComments, isPending: isCommentsLoading } = loadMutation

  const [editTarget, setEditTarget] = useState<AdminComment | null>(null)
  const [replyTarget, setReplyTarget] = useState<AdminComment | null>(null)
  const [editUserTarget, setEditUserTarget] = useState<AdminComment | null>(null)
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)

  useEffect(() => {
    if (!authorRehydrateData?.authors.length) {
      return
    }
    dispatch({ type: 'renameFilter', field: 'author', label: authorRehydrateData.authors[0].name })
  }, [authorRehydrateData, dispatch])

  useEffect(() => {
    if (!pageRehydrateData?.pages.length) {
      return
    }
    dispatch({ type: 'renameFilter', field: 'page', label: pageRehydrateData.pages[0].title || '无标题' })
  }, [pageRehydrateData, dispatch])

  // Map<id, comment> for cheap "Replied to" lookups in the row.
  const parentLookup = useMemo(() => new Map(state.comments.map((c) => [idStr(c.id), c])), [state.comments])

  // Round-trip filter state into the URL so the page is shareable and
  // back/forward restore the active filter set. Debounced to coalesce
  // rapid filter changes (e.g. typing in the text filter) into a single
  // history entry replacement.
  const [, setSearchParams] = useSearchParams()
  const urlSyncTimerRef = useRef<number | null>(null)
  useEffect(() => {
    if (urlSyncTimerRef.current !== null) {
      window.clearTimeout(urlSyncTimerRef.current)
    }
    urlSyncTimerRef.current = window.setTimeout(() => {
      const next = new URLSearchParams()
      for (const filter of state.filters) {
        if (filter.field === 'status' && filter.value !== 'all') {
          next.set('status', filter.value)
        } else if (filter.field === 'page' && filter.value) {
          next.set('pageKey', filter.value)
        } else if (filter.field === 'author' && filter.value) {
          next.set('userId', filter.value)
        } else if (filter.field === 'text' && filter.value) {
          try {
            const range = JSON.parse(filter.value) as { value?: string; op?: string }
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
            const range = JSON.parse(filter.value) as { date?: string; op?: string }
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
      setSearchParams(next, { replace: true, preventScrollReset: true })
    }, 300)
    return () => {
      if (urlSyncTimerRef.current !== null) {
        window.clearTimeout(urlSyncTimerRef.current)
      }
    }
  }, [state.filters, setSearchParams])

  const buildQueryInput = useCallback(
    (offset: number) => ({
      offset,
      limit: pageSize,
      ...(filterPageKey ? { pageKey: filterPageKey } : {}),
      ...(filterAuthorId ? { userId: filterAuthorId } : {}),
      ...(filterStatus !== 'all' ? { status: filterStatus } : {}),
      ...(filterText && filterText.value ? { q: filterText.value, match: filterText.op } : {}),
      ...(filterCreatedAfter ? { createdAfter: filterCreatedAfter } : {}),
      ...(filterCreatedBefore ? { createdBefore: filterCreatedBefore } : {}),
    }),
    [pageSize, filterPageKey, filterAuthorId, filterStatus, filterText, filterCreatedAfter, filterCreatedBefore],
  )

  // The inline filter chips (text / date) add themselves to the bar
  // with an empty value and only commit a real value on Enter / blur.
  // That means a state change like "add an empty text filter" still
  // re-runs this effect, even though the resulting query is
  // identical to the previous one. Tracking the last fired query key
  // and skipping the call when nothing actually changed keeps the
  // network silent (and avoids stacking `加载评论列表失败` toasts when
  // the server is slow / the user is exploring filter combos).
  //
  // `force: true` bypasses the skip for callback-driven reloads
  // (EditUserDialog, ReplyCommentDialog) where the underlying data
  // has changed even if the query shape hasn't.
  const lastQueryKeyRef = useRef<string | null>(null)
  const reload = useCallback(
    (force = false) => {
      const input = buildQueryInput(0)
      const key = JSON.stringify(input)
      if (!force && key === lastQueryKeyRef.current) {
        return
      }
      lastQueryKeyRef.current = key
      loadComments(input)
    },
    [loadComments, buildQueryInput],
  )

  useEffect(() => {
    reload()
  }, [reload])

  // Infinite scroll: load more via imperative API call
  const [loadingMore, setLoadingMore] = useState(false)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) {
      return
    }
    setLoadingMore(true)
    try {
      const result = await orpc.admin.comments.loadAll(buildQueryInput(state.comments.length))
      dispatch({
        type: 'appended',
        comments: result.comments,
        total: result.total,
      })
    } catch {
      toast.error('加载更多评论失败')
    } finally {
      setLoadingMore(false)
    }
  }, [loadingMore, hasMore, buildQueryInput, state.comments.length, dispatch])

  useEffect(() => {
    if (!hasMore) {
      return
    }
    const el = sentinelRef.current
    if (!el) {
      return
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          void loadMore()
        }
      },
      { rootMargin: '200px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasMore, loadMore])

  const pageItems = useMemo<FilterItem[]>(() => {
    const fetched = pagesData?.pages ?? []
    const items = fetched.map((p) => ({ value: p.key, label: p.title || '无标题' }))
    const current = state.filters.find((f) => f.field === 'page')
    if (current && !items.some((i) => i.value === current.value)) {
      items.unshift({ value: current.value, label: current.label })
    }
    return items
  }, [pagesData, state.filters])

  const authorItems = useMemo<FilterItem[]>(() => {
    const fetched = authorsData?.authors ?? []
    const items = fetched.map((a) => ({ value: a.id, label: a.name }))
    const current = state.filters.find((f) => f.field === 'author')
    if (current && !items.some((i) => i.value === current.value)) {
      items.unshift({ value: current.value, label: current.label })
    }
    return items
  }, [authorsData, state.filters])

  const askApprove = useCallback(
    (run: () => void) =>
      setConfirm({
        title: '审核通过该评论？',
        description: '审核通过后评论会立即对所有访客可见，并向作者发送通知邮件。',
        actionLabel: '通过',
        destructive: false,
        onConfirm: run,
      }),
    [],
  )
  const askDelete = useCallback(
    (run: () => void) =>
      setConfirm({
        title: '删除该评论？',
        description: '此操作不可撤销，删除后评论从前后台彻底消失。',
        actionLabel: '删除',
        destructive: true,
        onConfirm: run,
      }),
    [],
  )

  const handleAddFilter = useCallback(
    (field: FilterFieldKey, value: string, label: string) => {
      dispatch({ type: 'addFilter', field, value, label })
    },
    [dispatch],
  )

  const handleRemoveFilter = useCallback(
    (field: FilterFieldKey) => {
      dispatch({ type: 'removeFilter', field })
    },
    [dispatch],
  )

  const handleClearFilters = useCallback(() => {
    dispatch({ type: 'clearFilters' })
  }, [dispatch])

  const hasActiveFilters = state.filters.length > 0
  const isLoading = isCommentsLoading

  // The bar lives in the header next to the title when there's
  // nothing to show, and moves into the body once chips need the
  // room to wrap. One instance, two slots.
  const filterBar = (
    <CommentsFilterBar
      filters={state.filters}
      onAddFilter={handleAddFilter}
      onRemoveFilter={handleRemoveFilter}
      onClearFilters={handleClearFilters}
      pageItems={pageItems}
      authorItems={authorItems}
      onPageSearch={setPageQuery}
      onAuthorSearch={setAuthorQuery}
      isPagesPending={isPagesPending}
      isAuthorsPending={isAuthorsPending}
    />
  )

  return (
    <>
      <AdminListPage>
        <AdminListPage.Header title="评论管理" description="审核、回复、编辑站点评论。">
          <div className="flex items-center gap-2">{!hasActiveFilters && filterBar}</div>
        </AdminListPage.Header>

        {hasActiveFilters && filterBar}

        <AdminListPage.Body>
          <div className="divide-y">
            {isLoading ? (
              <CommentsSkeleton />
            ) : state.comments.length === 0 ? (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <SearchIcon />
                  </EmptyMedia>
                  <EmptyTitle>暂无评论</EmptyTitle>
                </EmptyHeader>
              </Empty>
            ) : (
              state.comments.map((comment) => (
                <AdminCommentRow
                  key={idStr(comment.id)}
                  comment={comment}
                  parentLookup={parentLookup}
                  onEdit={() => setEditTarget(comment)}
                  onReply={() => setReplyTarget(comment)}
                  onEditUser={() => setEditUserTarget(comment)}
                  onApproved={() => dispatch({ type: 'approveComment', id: idStr(comment.id) })}
                  onDeleted={() => dispatch({ type: 'removeComment', id: idStr(comment.id) })}
                  onConfirmApprove={askApprove}
                  onConfirmDelete={askDelete}
                  onFilterByPage={(pageKey, pageTitle) => {
                    dispatch({ type: 'addFilter', field: 'page', value: pageKey, label: pageTitle })
                    if (typeof window !== 'undefined') {
                      window.scrollTo({ top: 0, behavior: 'smooth' })
                    }
                  }}
                  onFilterByAuthor={(userId, name) => {
                    dispatch({ type: 'addFilter', field: 'author', value: userId, label: name })
                    if (typeof window !== 'undefined') {
                      window.scrollTo({ top: 0, behavior: 'smooth' })
                    }
                  }}
                />
              ))
            )}
          </div>

          {/* Sentinel for infinite scroll */}
          {hasMore && <div ref={sentinelRef} className="h-1" />}

          {/* Bottom status */}
          {(loadingMore || (!hasMore && state.comments.length > 0)) && (
            <div className="py-6 text-center text-sm text-muted-foreground">
              {loadingMore ? (
                <span className="inline-flex items-center gap-2">
                  <LoaderIcon className="size-4 animate-spin" />
                  加载中…
                </span>
              ) : (
                '已加载全部评论'
              )}
            </div>
          )}
        </AdminListPage.Body>
      </AdminListPage>

      <EditCommentDialog
        comment={editTarget}
        onClose={() => setEditTarget(null)}
        onSaved={(c) => {
          if (editTarget) {
            dispatch({ type: 'updateCommentContent', id: idStr(editTarget.id), body: c.body })
          }
          setEditTarget(null)
        }}
      />
      <EditUserDialog
        comment={editUserTarget}
        onClose={() => setEditUserTarget(null)}
        onSaved={() => {
          setEditUserTarget(null)
          reload(true)
        }}
      />
      <ReplyCommentDialog
        comment={replyTarget}
        authorName={currentUserName || '管理员'}
        authorEmail={currentUserEmail}
        onClose={() => setReplyTarget(null)}
        onReplied={() => {
          setReplyTarget(null)
          reload(true)
        }}
      />

      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </>
  )
}

function CommentsSkeleton() {
  return (
    <>
      {Array.from({ length: 3 }).map((_, i) => (
        // oxlint-disable-next-line react/no-array-index-key
        <div key={i} className="flex gap-3 px-4 py-3">
          <Skeleton className="size-10 shrink-0 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-12 w-full" />
          </div>
        </div>
      ))}
    </>
  )
}
