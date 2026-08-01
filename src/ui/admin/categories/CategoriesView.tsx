import { closestCenter, DndContext, type DragEndEvent } from '@dnd-kit/core'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PlusIcon, SearchIcon } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import type { AdminCategoryDto } from '@/shared/contracts/categories'

import { orpcQuery } from '@/client/api/orpc-query'
import { toastApiError } from '@/client/lib/toast-api-error'
import { CategoriesSkeleton, CategoryRow } from '@/ui/admin/categories/CategoryRow'
import { EditCategoryDialog } from '@/ui/admin/categories/EditCategoryDialog'
import { AdminListPage } from '@/ui/admin/shared/AdminListPage'
import { type ConfirmState, ConfirmDialog } from '@/ui/admin/shared/ConfirmDialog'
import { resolveSortableMove, useSortableSensors } from '@/ui/admin/shared/sortable'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/ui/components/empty'

type EditTarget = AdminCategoryDto | null | undefined

export function CategoriesView() {
  const queryClient = useQueryClient()
  const [editTarget, setEditTarget] = useState<EditTarget>(undefined)
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)

  // Server rows live exclusively in the TanStack cache (the list procedure
  // returns the full collection, no pagination) — mutations invalidate this
  // namespace instead of patching a local mirror.
  const listOptions = orpcQuery.admin.categories.list.queryOptions({ input: {} })
  const listQuery = useQuery(listOptions)
  // Memoized so the empty-fallback array identity is stable across renders —
  // `handleDragEnd` depends on `rows` and oxlint flags a fresh `?? []` each render.
  const rows = useMemo(() => listQuery.data?.categories ?? [], [listQuery.data?.categories])
  const total = listQuery.data?.total ?? 0

  useEffect(() => {
    if (listQuery.error) {
      toastApiError(listQuery.error, '加载分类失败')
    }
  }, [listQuery.error])

  const invalidateList = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: orpcQuery.admin.categories.list.key() })
  }, [queryClient])

  const deleteMutation = useMutation({
    ...orpcQuery.admin.categories.delete.mutationOptions(),
    onSuccess: () => {
      toast.success('已删除分类')
      // Invalidation re-syncs the cache so the deleted row disappears immediately.
      invalidateList()
    },
    onError: (error) => {
      setConfirm({
        title: '无法删除分类',
        description: error.message,
        actionLabel: '我知道了',
        destructive: false,
        onConfirm: () => undefined,
      })
    },
  })
  const submitDelete = deleteMutation.mutate

  const reorderMutation = useMutation({
    ...orpcQuery.admin.categories.reorder.mutationOptions(),
    onMutate: ({ orderedIds }) => {
      // Optimistic local reorder: rewrite each row's `sortOrder` to its new
      // index so the UI badge updates immediately. The mutation settles by
      // invalidating the list, restoring the canonical server order either way.
      const byId = new Map(rows.map((row) => [row.id, row]))
      const categories: AdminCategoryDto[] = []
      for (const [index, id] of orderedIds.entries()) {
        const row = byId.get(id)
        if (row) {
          categories.push({ ...row, sortOrder: index })
        }
      }
      queryClient.setQueryData(listOptions.queryKey, { categories, total })
    },
    onSuccess: invalidateList,
    onError: (error) => {
      setConfirm({
        title: '排序保存失败',
        description: `${error.message}。已重新加载最新顺序。`,
        actionLabel: '我知道了',
        destructive: false,
        onConfirm: () => undefined,
      })
      invalidateList()
    },
  })
  const submitReorder = reorderMutation.mutate

  const dndEnabled = rows.length > 1
  const isReorderPending = reorderMutation.isPending

  const sensors = useSortableSensors()

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      const ids = rows.map((row) => row.id)
      const move = resolveSortableMove(String(active.id), over ? String(over.id) : undefined, ids, (id) => id)
      if (!move) {
        return
      }
      const next = ids.slice()
      next.splice(move.from, 1)
      next.splice(move.to, 0, ids[move.from])
      if (next.every((id, index) => id === ids[index])) {
        return
      }
      submitReorder({ orderedIds: next })
    },
    [rows, submitReorder],
  )

  const isLoading = listQuery.isFetching && rows.length === 0

  return (
    <>
      <AdminListPage>
        <AdminListPage.Header
          title={
            <>
              分类管理 <span className="text-sm font-normal text-muted-foreground">{total}</span>
            </>
          }
        >
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {/* New category */}
            <button
              type="button"
              onClick={() => setEditTarget(null)}
              className="inline-flex h-9 items-center gap-1.5 rounded-(--radius) bg-primary px-3 font-medium text-(--text-admin-sm) text-primary-foreground shadow-none hover:bg-primary/90"
            >
              <PlusIcon className="size-4" />
              新增分类
            </button>
          </div>
        </AdminListPage.Header>

        <AdminListPage.Body>
          {isLoading ? (
            <CategoriesSkeleton />
          ) : rows.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <SearchIcon />
                </EmptyMedia>
                <EmptyTitle>未找到分类</EmptyTitle>
              </EmptyHeader>
            </Empty>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
              modifiers={[restrictToVerticalAxis]}
            >
              <SortableContext items={rows.map((row) => row.id)} strategy={verticalListSortingStrategy}>
                <div className="divide-y">
                  {rows.map((row) => (
                    <CategoryRow
                      key={row.id}
                      category={row}
                      sortEnabled={dndEnabled && !isReorderPending}
                      onEdit={() => setEditTarget(row)}
                      onDelete={() =>
                        setConfirm({
                          title: `删除分类「${row.name}」？`,
                          description:
                            '此操作会从数据库直接删除该分类。如果仍有文章引用此分类，删除将被阻止；请先在引用文章中修改后再删除。',
                          actionLabel: '删除',
                          destructive: true,
                          onConfirm: () => submitDelete({ id: row.id }),
                        })
                      }
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </AdminListPage.Body>
      </AdminListPage>

      <EditCategoryDialog
        category={editTarget}
        onClose={() => setEditTarget(undefined)}
        onSaved={() => {
          invalidateList()
          setEditTarget(undefined)
        }}
      />

      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </>
  )
}
