import { useQuery } from '@tanstack/react-query'
import { LoaderIcon, SearchIcon } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'

import type { AdminCommentWire as AdminComment } from '@/shared/types/comments'
import type { ActiveFilter, FilterFieldKey, FilterItem } from '@/ui/admin/comments/useCommentsController'

import { orpc } from '@/client/api/client'
import { orpcQuery } from '@/client/api/orpc-query'
import { getLogger } from '@/client/lib/logger'
import { idStr } from '@/shared/utils/tools'
import { unsafeCast } from '@/shared/utils/unsafe-cast'
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
const log = getLogger('comments.CommentsView')

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

  const [isCommentsLoading, setIsCommentsLoading] = useState(false)
  const lastQueryKeyRef = useRef<string | null>(null)

  const loadComments = useCallback(
    async (input: { offset: number; limit: number }) => {
      setIsCommentsLoading(true)
      try {
        const result = await orpc.admin.comments.loadAll(input)
        dispatch({
          type: 'loaded',
          comments: result.comments,
          total: result.total,
          statusCounts: result.statusCounts,
        })
      } catch (error) {
        toast.error('加载评论列表失败', { description: error instanceof Error ? error.message : String(error) })
      } finally {
        setIsCommentsLoading(false)
      }
    },
    [dispatch],
  )

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

  const parentLookup = useMemo(() => new Map(state.comments.map((c) => [idStr(c.id), c])), [state.comments])

  const [searchParams, setSearchParams] = useSearchParams()
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
    }, 300)
    return () => {
      if (urlSyncTimerRef.current !== null) {
        window.clearTimeout(urlSyncTimerRef.current)
      }
    }
  }, [state.filters, setSearchParams, searchParams])

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

  const reload = useCallback(
    (force = false) => {
      const input = buildQueryInput(0)
      const key = JSON.stringify(input)
      if (!force && key === lastQueryKeyRef.current) {
        return
      }
      lastQueryKeyRef.current = key
      void loadComments(input)
    },
    [loadComments, buildQueryInput],
  )

  useEffect(() => {
    reload()
  }, [reload])

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
    } catch (error) {
      toast.error('加载更多评论失败')
      log.warn('Failed to load more comments', { error })
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
  const askApproveDeletion = useCallback(
    (run: () => void) =>
      setConfirm({
        title: '同意删除该评论？',
        description: '同意后评论会被标记为已删除，并从前后台隐藏。',
        actionLabel: '同意删除',
        destructive: true,
        onConfirm: run,
      }),
    [],
  )
  const askRejectDeletion = useCallback(
    (run: () => void) =>
      setConfirm({
        title: '拒绝删除申请？',
        description: '拒绝后该评论会恢复为正常状态，作者需要重新申请才能再次删除。',
        actionLabel: '拒绝删除',
        destructive: false,
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

  const handleDeleteRequestResolved = useCallback(
    (id: string, approved: boolean, isPending: boolean) => {
      if (approved) {
        dispatch({ type: 'removeComment', id })
      } else {
        dispatch({ type: 'clearDeleteRequest', id, isPending })
      }
    },
    [dispatch],
  )

  const hasActiveFilters = state.filters.length > 0
  const isLoading = isCommentsLoading

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
          {/* Header slot only when no filters are active — body slot below takes over otherwise. */}
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
                  onDeleteRequestResolved={(approved) =>
                    handleDeleteRequestResolved(idStr(comment.id), approved, comment.isPending === true)
                  }
                  onConfirmApprove={askApprove}
                  onConfirmDelete={askDelete}
                  onConfirmApproveDeletion={askApproveDeletion}
                  onConfirmRejectDeletion={askRejectDeletion}
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

          {hasMore && <div ref={sentinelRef} className="h-1" />}
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
        // Skeleton placeholders — static-length array, index is stable.
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
