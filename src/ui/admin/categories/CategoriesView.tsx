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
import { Button } from '@/ui/components/button'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/ui/components/empty'
import { useI18n } from '@/ui/lib/I18nProvider'

type EditTarget = AdminCategoryDto | null | undefined

export function CategoriesView() {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const [editTarget, setEditTarget] = useState<EditTarget>(undefined)
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)

  // Full collection in the TanStack cache — mutations invalidate the namespace, no local mirror.
  const listOptions = orpcQuery.admin.categories.list.queryOptions({ input: {} })
  const listQuery = useQuery(listOptions)
  // Memoized so the empty-fallback array identity is stable — `handleDragEnd` depends on `rows`.
  const rows = useMemo(() => listQuery.data?.categories ?? [], [listQuery.data?.categories])
  const total = listQuery.data?.total ?? 0

  useEffect(() => {
    if (listQuery.error) {
      toastApiError(listQuery.error, 'admin.toast.categoriesLoadFailed', t)
    }
  }, [listQuery.error, t])

  const invalidateList = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: orpcQuery.admin.categories.list.key() })
  }, [queryClient])

  const deleteMutation = useMutation({
    ...orpcQuery.admin.categories.delete.mutationOptions(),
    onSuccess: () => {
      toast.success(t('admin.categories.deleted'))
      invalidateList()
    },
    onError: (error) => {
      setConfirm({
        title: t('admin.categories.deleteBlockedTitle'),
        description: error.message,
        actionLabel: t('admin.categories.acknowledge'),
        destructive: false,
        onConfirm: () => undefined,
      })
    },
  })
  const submitDelete = deleteMutation.mutate

  const reorderMutation = useMutation({
    ...orpcQuery.admin.categories.reorder.mutationOptions(),
    onMutate: ({ orderedIds }) => {
      // Optimistic reorder rewrites each row's `sortOrder`; the mutation settles by invalidating the list.
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
        title: t('admin.categories.reorderFailedTitle'),
        description: t('admin.categories.reorderFailedBody', { message: error.message }),
        actionLabel: t('admin.categories.acknowledge'),
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
              {t('admin.categories.title')} <span className="text-sm font-normal text-muted-foreground">{total}</span>
            </>
          }
        >
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button type="button" size="sm" onClick={() => setEditTarget(null)}>
              <PlusIcon className="size-4" />
              {t('admin.categories.new')}
            </Button>
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
                <EmptyTitle>{t('admin.categories.empty')}</EmptyTitle>
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
                          title: t('admin.categories.deleteTitle', { name: row.name }),
                          description: t('admin.categories.deleteBody'),
                          actionLabel: t('common.action.delete'),
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
