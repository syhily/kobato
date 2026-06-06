import { LoaderIcon, PlusIcon, SearchIcon } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import type { AdminTagDto } from '@/shared/types/tags'

import { orpc } from '@/client/api/client'
import { orpcQuery, useMutation, useQuery } from '@/client/api/query'
import { AdminListPage } from '@/ui/admin/shared/AdminListPage'
import { type ConfirmState, ConfirmDialog } from '@/ui/admin/shared/ConfirmDialog'
import { useDebouncedSearch } from '@/ui/admin/shared/useDebouncedSearch'
import { EditTagDialog } from '@/ui/admin/tags/EditTagDialog'
import { TagRow, TagsSkeleton } from '@/ui/admin/tags/TagRows'
import { useTagsController } from '@/ui/admin/tags/useTagsController'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/ui/components/empty'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/components/table'

const PAGE_SIZE = 30

type EditTarget = AdminTagDto | null | undefined

export function TagsView() {
  const { state, dispatch } = useTagsController()
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const [editTarget, setEditTarget] = useState<EditTarget>(undefined)

  const {
    data: listData,
    isPending: isListPending,
    error: listError,
  } = useQuery(
    orpcQuery.admin.tags.list.queryOptions({
      input: {
        q: state.q || undefined,
        offset: 0,
        limit: PAGE_SIZE,
      },
    }),
  )

  useEffect(() => {
    if (listData) {
      dispatch({
        type: 'loaded',
        rows: listData.tags,
        total: listData.total,
        hasMore: listData.hasMore,
      })
    }
  }, [listData, dispatch])

  useEffect(() => {
    if (listError) {
      toast.error('加载标签列表失败', { description: listError.message })
    }
  }, [listError])

  const [loadingMore, setLoadingMore] = useState(false)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const hasMore = state.hasMore

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) {
      return
    }
    setLoadingMore(true)
    try {
      const result = await orpc.admin.tags.list({
        q: state.q || undefined,
        offset: state.rows.length,
        limit: PAGE_SIZE,
      })
      dispatch({
        type: 'appended',
        rows: result.tags,
        total: result.total,
        hasMore: result.hasMore,
      })
    } catch (err) {
      toast.error('加载更多标签失败', {
        description: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setLoadingMore(false)
    }
  }, [loadingMore, hasMore, state.q, state.rows.length, dispatch])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !hasMore) {
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void loadMore()
        }
      },
      { rootMargin: '200px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [loadMore, hasMore])

  // The fetcher hook's success callback doesn't receive the original
  // request payload, so latch the in-flight delete id into a ref. Once
  // the server confirms the delete, the success handler reads this id
  // and dispatches the row removal — keeping the optimistic UI
  // accurate even if the server rejects with 409 ("still referenced"),
  // because in that case the row stays put and the error message is
  // surfaced through the confirm dialog.
  const pendingDeleteIdRef = useRef<string | null>(null)
  const deleteApi = useMutation({
    mutationFn: (id: string) => orpc.admin.tags.delete({ id }),
    onSuccess: () => {
      const id = pendingDeleteIdRef.current
      pendingDeleteIdRef.current = null
      if (id) {
        dispatch({ type: 'removeTag', id })
      }
      setEditTarget(undefined)
    },
    onError: (error) => {
      pendingDeleteIdRef.current = null
      setConfirm({
        title: '无法删除标签',
        description: error.message,
        actionLabel: '我知道了',
        destructive: false,
        onConfirm: () => undefined,
      })
    },
  })

  const [qInput, setQInput] = useDebouncedSearch({
    delayMs: 300,
    onChange: (value) => dispatch({ type: 'setQ', value }),
  })

  const isLoading = isListPending && state.rows.length === 0
  const isDialogOpen = editTarget !== undefined

  const handleDelete = useCallback(
    (row: AdminTagDto) => {
      setConfirm({
        title: `删除标签「${row.name}」？`,
        description:
          '此操作会从数据库直接删除该标签。如果仍有文章引用此标签，删除将被阻止；请先在 MDX frontmatter 中改写后再删除。',
        actionLabel: '删除',
        destructive: true,
        onConfirm: () => {
          pendingDeleteIdRef.current = row.id
          deleteApi.mutate(row.id)
        },
      })
    },
    [deleteApi],
  )

  return (
    <>
      <AdminListPage>
        <AdminListPage.Header
          title={
            <>
              标签管理 <span className="text-sm font-normal text-muted-foreground">{state.total}</span>
            </>
          }
        >
          <div className="flex items-center gap-3">
            <div className="relative w-56">
              <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
                placeholder="搜索名称或 slug…"
                aria-label="搜索标签"
                className="h-9 w-full rounded-xl border border-input bg-transparent py-1 pr-3 pl-9 text-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
            <button
              type="button"
              onClick={() => setEditTarget(null)}
              disabled={isDialogOpen}
              className="inline-flex h-9 items-center gap-1.5 rounded-(--radius) bg-primary px-3 font-medium text-(--text-admin-sm) text-primary-foreground shadow-none hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <PlusIcon className="size-4" />
              新增标签
            </button>
          </div>
        </AdminListPage.Header>

        <AdminListPage.Body>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[28%]">名称</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead className="w-24">文章</TableHead>
                <TableHead className="w-[60px] pr-4 text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TagsSkeleton />
              ) : state.rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="p-0">
                    <Empty className="border-0">
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <SearchIcon />
                        </EmptyMedia>
                        <EmptyTitle>未找到标签</EmptyTitle>
                      </EmptyHeader>
                    </Empty>
                  </TableCell>
                </TableRow>
              ) : (
                state.rows.map((row) => (
                  <TagRow
                    key={row.id}
                    tag={row}
                    disabled={isDialogOpen}
                    onEdit={() => setEditTarget(row)}
                    onDelete={() => handleDelete(row)}
                  />
                ))
              )}
            </TableBody>
          </Table>

          {/* Sentinel for infinite scroll */}
          {hasMore && <div ref={sentinelRef} className="h-1" />}

          {/* Bottom status */}
          <div className="py-6 text-center text-sm text-muted-foreground">
            {loadingMore ? (
              <span className="inline-flex items-center gap-2">
                <LoaderIcon className="size-4 animate-spin" />
                加载中…
              </span>
            ) : !hasMore && state.rows.length > 0 ? (
              '已加载全部标签'
            ) : null}
          </div>
        </AdminListPage.Body>
      </AdminListPage>

      <EditTagDialog
        tag={editTarget}
        onClose={() => setEditTarget(undefined)}
        onSaved={(saved) => {
          if (editTarget === null) {
            dispatch({ type: 'prependTag', tag: saved })
          } else {
            dispatch({ type: 'patchTag', tag: saved })
          }
          setEditTarget(undefined)
        }}
      />

      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </>
  )
}
