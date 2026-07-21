import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { LoaderIcon, PlusIcon, SearchIcon } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import type { AdminTagDto } from '@/shared/types/tags'

import { orpc } from '@/client/api/client'
import { orpcQuery } from '@/client/api/orpc-query'
import { useInfiniteScrollSentinel } from '@/client/hooks/use-infinite-scroll-sentinel'
import { AdminListPage } from '@/ui/admin/shared/AdminListPage'
import { type ConfirmState, ConfirmDialog } from '@/ui/admin/shared/ConfirmDialog'
import { useDebouncedSearch } from '@/ui/admin/shared/useDebouncedSearch'
import { EditTagDialog } from '@/ui/admin/tags/EditTagDialog'
import { TagRow, TagsSkeleton } from '@/ui/admin/tags/TagRows'
import { useTagsFilters } from '@/ui/admin/tags/useTagsFilters'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/ui/components/empty'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/components/table'

const PAGE_SIZE = 30

type EditTarget = AdminTagDto | null | undefined

export function TagsView() {
  const { q, setQ } = useTagsFilters()
  const queryClient = useQueryClient()
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const [editTarget, setEditTarget] = useState<EditTarget>(undefined)

  // Server rows live exclusively in the TanStack cache — every loaded page
  // is refetched together on invalidation, and mutations invalidate this
  // namespace instead of patching local mirrors.
  const listQuery = useInfiniteQuery(
    orpcQuery.admin.tags.list.infiniteOptions({
      input: (pageParam: number) => ({
        q: q || undefined,
        offset: pageParam,
        limit: PAGE_SIZE,
      }),
      getNextPageParam: (lastPage, _allPages, lastPageParam) => {
        if (!lastPage.hasMore) {
          return undefined
        }
        return (lastPageParam ?? 0) + PAGE_SIZE
      },
      initialPageParam: 0,
    }),
  )
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = listQuery
  const sentinelRef = useInfiniteScrollSentinel({ hasNextPage, isFetchingNextPage, fetchNextPage })

  const rows = useMemo(() => listQuery.data?.pages.flatMap((page) => page.tags) ?? [], [listQuery.data])
  const total = listQuery.data?.pages[0]?.total ?? 0

  useEffect(() => {
    if (listQuery.error) {
      toast.error('加载标签列表失败', { description: listQuery.error.message })
    }
  }, [listQuery.error])

  // On success the whole list namespace is invalidated (EditTagDialog does
  // the same for upserts) instead of patching a local mirror — a rejected
  // delete (409 "still referenced") leaves the cache untouched and the error
  // is surfaced through the confirm dialog.
  const deleteApi = useMutation({
    mutationFn: (id: string) => orpc.admin.tags.delete({ id }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: orpcQuery.admin.tags.list.key() })
      setEditTarget(undefined)
    },
    onError: (error) => {
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
    onChange: setQ,
  })

  const isLoading = listQuery.isLoading
  const isDialogOpen = editTarget !== undefined

  const handleDelete = useCallback(
    (row: AdminTagDto) => {
      setConfirm({
        title: `删除标签「${row.name}」？`,
        description:
          '此操作会从数据库直接删除该标签。如果仍有文章引用此标签，删除将被阻止；请先在引用文章中修改后再删除。',
        actionLabel: '删除',
        destructive: true,
        onConfirm: () => {
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
              标签管理 <span className="text-sm font-normal text-muted-foreground">{total}</span>
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
                className="h-9 w-full rounded-xl border border-input bg-transparent py-1 pr-3 pl-9 text-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:shadow-focus focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
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
              ) : rows.length === 0 ? (
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
                rows.map((row) => (
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
          {hasNextPage && <div ref={sentinelRef} className="h-1" />}

          {/* Bottom status */}
          <div className="py-6 text-center text-sm text-muted-foreground">
            {isFetchingNextPage ? (
              <span className="inline-flex items-center gap-2">
                <LoaderIcon className="size-4 animate-spin" />
                加载中…
              </span>
            ) : !hasNextPage && rows.length > 0 ? (
              '已加载全部标签'
            ) : null}
          </div>
        </AdminListPage.Body>
      </AdminListPage>

      <EditTagDialog
        tag={editTarget}
        onClose={() => setEditTarget(undefined)}
        onSaved={() => setEditTarget(undefined)}
      />

      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </>
  )
}
