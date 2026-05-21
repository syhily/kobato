import { RefreshCwIcon, SearchIcon, XIcon } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import type { AdminCommentWire as AdminComment } from '@/shared/contracts/comments'
import type { FilterItem, FilterStatus } from '@/ui/admin/comments/useCommentsController'

import { orpcQuery, useMutation, useQuery } from '@/client/api/query'
import { idStr } from '@/shared/utils/tools'
import { AdminCommentRow } from '@/ui/admin/comments/AdminCommentRow'
import { EditCommentDialog } from '@/ui/admin/comments/EditCommentDialog'
import { EditUserDialog } from '@/ui/admin/comments/EditUserDialog'
import { ReplyCommentDialog } from '@/ui/admin/comments/ReplyCommentDialog'
import { useCommentsController } from '@/ui/admin/comments/useCommentsController'
import { AdminListPage } from '@/ui/admin/shared/AdminListPage'
import { type ConfirmState, ConfirmDialog } from '@/ui/admin/shared/ConfirmDialog'
import { useDebouncedSearch } from '@/ui/admin/shared/useDebouncedSearch'
import { Button } from '@/ui/components/button'
import { Card, CardContent } from '@/ui/components/card'
import { Combobox, ComboboxContent, ComboboxItem, ComboboxTrigger, ComboboxValue } from '@/ui/components/combobox'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/ui/components/empty'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/components/select'
import { Skeleton } from '@/ui/components/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/ui/components/tabs'

// How long to wait after the user stops typing in a Combobox input
// before firing the autocomplete request. 250ms feels snappy without
// firing on every keystroke for slow-typing CJK IMEs.
const FILTER_QUERY_DEBOUNCE_MS = 250

const PAGE_SIZE_OPTIONS: { value: string; label: string }[] = [10, 20, 50, 100].map((n) => ({
  value: String(n),
  label: `${n} 条`,
}))

// Tiny "X 清除" affordance shown next to a filter label whenever that
// filter is non-empty. Uses the `destructive-soft` Button variant
// (light-pink bg, magenta text) so it visually telegraphs "removes a
// selection" without yelling at the user. Kept small (`size="sm"` plus
// shorter horizontal padding via `px-2`) so it fits neatly on the
// header row above each Combobox without inflating the row height.
function ClearFilterButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="destructive-soft"
      size="sm"
      onClick={onClick}
      className="h-7 gap-1 px-2 py-0 text-xs"
    >
      <XIcon data-icon="sm" />
      清除
    </Button>
  )
}

export interface CommentsViewProps {
  currentUserName: string
  currentUserEmail: string
  initialAuthorId?: string
  initialPageKey?: string
  initialStatus?: FilterStatus
}

export function CommentsView({
  currentUserName,
  currentUserEmail,
  initialAuthorId = '',
  initialPageKey = '',
  initialStatus = 'all',
}: CommentsViewProps) {
  const { state, dispatch, filterPageKey, filterAuthorId } = useCommentsController({
    initialAuthorId,
    initialPageKey,
    initialStatus,
  })

  const loadMutation = useMutation({
    ...orpcQuery.admin.comments.loadAll.mutationOptions(),
    onSuccess: (payload) => {
      dispatch({
        type: 'loaded',
        comments: payload.comments,
        total: payload.total,
        hasMore: payload.hasMore,
        statusCounts: payload.statusCounts,
      })
    },
    onError: (error) => {
      toast.error('加载评论列表失败', { description: error.message })
    },
  })

  const [debouncedPageQuery, setDebouncedPageQuery] = useState('')
  const [pageQuery, setPageQuery] = useDebouncedSearch({
    delayMs: FILTER_QUERY_DEBOUNCE_MS,
    onChange: (value) => setDebouncedPageQuery(value),
  })

  const [debouncedAuthorQuery, setDebouncedAuthorQuery] = useState('')
  const [authorQuery, setAuthorQuery] = useDebouncedSearch({
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

  const { data: authorRehydrateData } = useQuery(
    orpcQuery.admin.comments.searchAuthors.queryOptions({
      input: initialAuthorId ? { ids: initialAuthorId } : {},
      enabled: !!initialAuthorId,
    }),
  )

  const { data: pageRehydrateData } = useQuery(
    orpcQuery.admin.comments.searchPages.queryOptions({
      input: initialPageKey ? { key: initialPageKey } : {},
      enabled: !!initialPageKey,
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
    dispatch({ type: 'renameFilterAuthor', label: authorRehydrateData.authors[0].name })
  }, [authorRehydrateData, dispatch])

  useEffect(() => {
    if (!pageRehydrateData?.pages.length) {
      return
    }
    dispatch({ type: 'renameFilterPage', label: pageRehydrateData.pages[0].title || '无标题' })
  }, [pageRehydrateData, dispatch])

  const reload = useCallback(() => {
    const offset = state.currentPage * state.pageSize
    loadComments({
      offset,
      limit: state.pageSize,
      ...(filterPageKey ? { pageKey: filterPageKey } : {}),
      ...(filterAuthorId ? { userId: filterAuthorId } : {}),
      ...(state.filterStatus !== 'all' ? { status: state.filterStatus } : {}),
    })
  }, [loadComments, state.currentPage, state.pageSize, filterPageKey, filterAuthorId, state.filterStatus])

  useEffect(() => {
    reload()
  }, [reload])

  // Server-returned items, normalised to `{ value, label }` so Base UI
  // Combobox can auto-display labels via `Combobox.Value`. We also splice
  // the currently selected item back in (when not present in the latest
  // server response) so Base UI's "selected indicator" can still find a
  // match in the rendered list — otherwise the check-mark would silently
  // disappear when the user starts typing a query that excludes their
  // current selection.
  const pageItems = useMemo<FilterItem[]>(() => {
    const fetched = pagesData?.pages ?? []
    const items = fetched.map((p) => ({ value: p.key, label: p.title || '无标题' }))
    if (state.filterPage && !items.some((i) => i.value === state.filterPage!.value)) {
      items.unshift(state.filterPage)
    }
    return items
  }, [pagesData, state.filterPage])

  const authorItems = useMemo<FilterItem[]>(() => {
    const fetched = authorsData?.authors ?? []
    const items = fetched.map((a) => ({ value: a.id, label: a.name }))
    if (state.filterAuthor && !items.some((i) => i.value === state.filterAuthor!.value)) {
      items.unshift(state.filterAuthor)
    }
    return items
  }, [authorsData, state.filterAuthor])

  const totalPages = useMemo(() => Math.max(1, Math.ceil(state.total / state.pageSize)), [state.total, state.pageSize])

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

  const isLoading = isCommentsLoading

  return (
    <>
      <AdminListPage>
        <AdminListPage.Header title="评论管理" description="审核、回复、编辑站点评论。">
          <Button type="button" variant="outline" className="border-ink-4" onClick={reload} disabled={isLoading}>
            <RefreshCwIcon data-icon="inline-start" /> 刷新
          </Button>
        </AdminListPage.Header>

        <AdminListPage.Toolbar>
          <Tabs
            value={state.filterStatus}
            onValueChange={(value) => dispatch({ type: 'setFilterStatus', value: value as FilterStatus })}
          >
            <TabsList>
              <TabsTrigger value="all">全部 · {state.statusCounts.all}</TabsTrigger>
              <TabsTrigger value="pending">待审核 · {state.statusCounts.pending}</TabsTrigger>
              <TabsTrigger value="approved">已审核 · {state.statusCounts.approved}</TabsTrigger>
            </TabsList>
          </Tabs>
          {/*
           * Filter row. The `FilterField` compound owns the label-row alignment
           * (fixed 28px) so the three controls below stay aligned even when only
           * one column has a "X 清除" button visible.
           */}
          <div className="grid gap-3 sm:grid-cols-3">
            <AdminListPage.FilterField
              label="筛选文章"
              action={
                state.filterPage ? (
                  <ClearFilterButton onClick={() => dispatch({ type: 'setFilterPage', value: null })} />
                ) : undefined
              }
            >
              <Combobox<FilterItem>
                items={pageItems}
                value={state.filterPage}
                onValueChange={(item) => dispatch({ type: 'setFilterPage', value: item })}
                inputValue={pageQuery}
                onInputValueChange={(value) => setPageQuery(value)}
                filter={null}
              >
                <ComboboxTrigger className="w-full">
                  <ComboboxValue placeholder="全部文章" />
                </ComboboxTrigger>
                <ComboboxContent<FilterItem>
                  inputPlaceholder="搜索文章…"
                  emptyMessage={isPagesPending ? '加载中…' : '无匹配文章'}
                >
                  {(item) => (
                    <ComboboxItem key={item.value} value={item}>
                      {item.label}
                    </ComboboxItem>
                  )}
                </ComboboxContent>
              </Combobox>
            </AdminListPage.FilterField>
            <AdminListPage.FilterField
              label="筛选评论人员"
              action={
                state.filterAuthor ? (
                  <ClearFilterButton onClick={() => dispatch({ type: 'setFilterAuthor', value: null })} />
                ) : undefined
              }
            >
              <Combobox<FilterItem>
                items={authorItems}
                value={state.filterAuthor}
                onValueChange={(item) => dispatch({ type: 'setFilterAuthor', value: item })}
                inputValue={authorQuery}
                onInputValueChange={(value) => setAuthorQuery(value)}
                filter={null}
              >
                <ComboboxTrigger className="w-full">
                  <ComboboxValue placeholder="全部人员" />
                </ComboboxTrigger>
                <ComboboxContent<FilterItem>
                  inputPlaceholder="搜索人员…"
                  emptyMessage={isAuthorsPending ? '加载中…' : '无匹配人员'}
                >
                  {(item) => (
                    <ComboboxItem key={item.value} value={item}>
                      {item.label}
                    </ComboboxItem>
                  )}
                </ComboboxContent>
              </Combobox>
            </AdminListPage.FilterField>
            <AdminListPage.FilterField label="每页显示">
              <Select
                items={PAGE_SIZE_OPTIONS}
                value={String(state.pageSize)}
                onValueChange={(value) => dispatch({ type: 'setPageSize', value: Number.parseInt(value ?? '10', 10) })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </AdminListPage.FilterField>
          </div>
        </AdminListPage.Toolbar>

        <AdminListPage.Body>
          <div className="flex flex-col gap-3">
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
                  onEdit={() => setEditTarget(comment)}
                  onReply={() => setReplyTarget(comment)}
                  onEditUser={() => setEditUserTarget(comment)}
                  onApproved={() => dispatch({ type: 'approveComment', id: idStr(comment.id) })}
                  onDeleted={() => dispatch({ type: 'removeComment', id: idStr(comment.id) })}
                  onConfirmApprove={askApprove}
                  onConfirmDelete={askDelete}
                  onFilterByPage={(pageKey, pageTitle) => {
                    dispatch({ type: 'setFilterPage', value: { value: pageKey, label: pageTitle } })
                    if (typeof window !== 'undefined') {
                      window.scrollTo({ top: 0, behavior: 'smooth' })
                    }
                  }}
                  onFilterByAuthor={(userId, name) => {
                    dispatch({ type: 'setFilterAuthor', value: { value: userId, label: name } })
                    if (typeof window !== 'undefined') {
                      window.scrollTo({ top: 0, behavior: 'smooth' })
                    }
                  }}
                />
              ))
            )}
          </div>
        </AdminListPage.Body>

        <AdminListPage.PageNavigation
          totalPages={totalPages}
          currentPage={state.currentPage}
          onChange={(page) => dispatch({ type: 'setCurrentPage', value: page })}
        />
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
          reload()
        }}
      />
      <ReplyCommentDialog
        comment={replyTarget}
        authorName={currentUserName || '管理员'}
        authorEmail={currentUserEmail}
        onClose={() => setReplyTarget(null)}
        onReplied={() => {
          setReplyTarget(null)
          reload()
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
        // Skeleton cards — identical placeholders, swapped wholesale on load.
        // oxlint-disable-next-line react/no-array-index-key
        <Card key={i}>
          <CardContent className="flex gap-4">
            <Skeleton className="size-12 shrink-0 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-12 w-full" />
            </div>
          </CardContent>
        </Card>
      ))}
    </>
  )
}
