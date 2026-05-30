import { PlusIcon, SearchIcon } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import type { AdminCategoryDto } from '@/shared/types/categories'

import { orpcQuery, useMutation, useQuery } from '@/client/api/query'
import { CategoriesSkeleton, CategoryRow } from '@/ui/admin/categories/CategoryRow'
import { EditCategoryDialog } from '@/ui/admin/categories/EditCategoryDialog'
import { useCategoriesController } from '@/ui/admin/categories/useCategoriesController'
import { AdminListPage } from '@/ui/admin/shared/AdminListPage'
import { type ConfirmState, ConfirmDialog } from '@/ui/admin/shared/ConfirmDialog'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/ui/components/empty'

type EditTarget = AdminCategoryDto | null | undefined

export function CategoriesView() {
  const { state, dispatch } = useCategoriesController()
  const [editTarget, setEditTarget] = useState<EditTarget>(undefined)
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)

  const listQuery = useQuery(
    orpcQuery.admin.categories.list.queryOptions({
      input: {},
    }),
  )

  useEffect(() => {
    if (listQuery.data) {
      dispatch({ type: 'loaded', rows: listQuery.data.categories, total: listQuery.data.total })
    }
  }, [listQuery.data, dispatch])

  useEffect(() => {
    if (listQuery.error) {
      toast.error('加载分类失败', { description: listQuery.error.message })
    }
  }, [listQuery.error])

  const isListPending = listQuery.isFetching

  const reload = useCallback(() => {
    void listQuery.refetch()
  }, [listQuery])

  const deleteMutation = useMutation({
    ...orpcQuery.admin.categories.delete.mutationOptions(),
    onSuccess: () => {
      toast.success('已删除分类')
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
    onSuccess: (payload) => dispatch({ type: 'replaceRows', rows: payload.categories }),
    onError: (error) => {
      setConfirm({
        title: '排序保存失败',
        description: `${error.message}。已重新加载最新顺序。`,
        actionLabel: '我知道了',
        destructive: false,
        onConfirm: () => undefined,
      })
      reload()
    },
  })
  const submitReorder = reorderMutation.mutate

  const dndEnabled = state.rows.length > 1
  const isReorderPending = reorderMutation.isPending

  const dragOriginRef = useRef<string | null>(null)

  const onDragStart = useCallback((id: string) => {
    dragOriginRef.current = id
    setDraggingId(id)
  }, [])

  const onDragEnd = useCallback(() => {
    dragOriginRef.current = null
    setDraggingId(null)
  }, [])

  const onDropOnRow = useCallback(
    (targetId: string) => {
      const sourceId = dragOriginRef.current
      dragOriginRef.current = null
      setDraggingId(null)
      if (sourceId === null || sourceId === targetId) {
        return
      }
      const ids = state.rows.map((row) => row.id)
      const fromIndex = ids.indexOf(sourceId)
      const toIndex = ids.indexOf(targetId)
      if (fromIndex < 0 || toIndex < 0) {
        return
      }
      const next = ids.slice()
      next.splice(fromIndex, 1)
      next.splice(toIndex, 0, sourceId)
      if (next.every((id, index) => id === ids[index])) {
        return
      }
      dispatch({ type: 'reorderRows', orderedIds: next })
      submitReorder({ orderedIds: next })
    },
    [dispatch, state.rows, submitReorder],
  )

  const isLoading = isListPending && state.rows.length === 0

  return (
    <>
      <AdminListPage>
        <AdminListPage.Header
          title={
            <>
              分类管理 <span className="text-sm font-normal text-muted-foreground">{state.total}</span>
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
          ) : state.rows.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <SearchIcon />
                </EmptyMedia>
                <EmptyTitle>未找到分类</EmptyTitle>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="divide-y">
              {state.rows.map((row) => (
                <CategoryRow
                  key={row.id}
                  category={row}
                  dragEnabled={dndEnabled && !isReorderPending}
                  isDragging={draggingId === row.id}
                  onDragStart={onDragStart}
                  onDragEnd={onDragEnd}
                  onDropOnRow={onDropOnRow}
                  onEdit={() => setEditTarget(row)}
                  onDelete={() =>
                    setConfirm({
                      title: `删除分类「${row.name}」？`,
                      description:
                        '此操作会从数据库直接删除该分类。如果仍有文章引用此分类，删除将被阻止；请先在 MDX frontmatter 中改写后再删除。',
                      actionLabel: '删除',
                      destructive: true,
                      onConfirm: () => submitDelete({ id: row.id }),
                    })
                  }
                />
              ))}
            </div>
          )}
        </AdminListPage.Body>
      </AdminListPage>

      <EditCategoryDialog
        category={editTarget}
        onClose={() => setEditTarget(undefined)}
        onSaved={(saved) => {
          if (editTarget === null) {
            dispatch({ type: 'prependCategory', category: saved })
          } else {
            dispatch({ type: 'patchCategory', category: saved })
          }
          setEditTarget(undefined)
        }}
      />

      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </>
  )
}
