import {
  closestCorners,
  type CollisionDetection,
  DndContext,
  type DragEndEvent,
  pointerWithin,
  useDraggable,
  useDroppable,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { GripVerticalIcon, Trash2Icon, XIcon } from 'lucide-react'
import { useState } from 'react'
import { useRevalidator } from 'react-router'
import { toast } from 'sonner'

import type { AdminFontDto, FontSlot } from '@/shared/contracts/fonts'
import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'

import { orpc } from '@/client/api/client'
import { orpcQuery } from '@/client/api/orpc-query'
import { onMutationError } from '@/client/lib/toast-api-error'
import { formatBytes } from '@/shared/i18n/format'
import {
  isDragData,
  isSlotDropData,
  isSlotItemData,
  libDragId,
  type LibraryDragData,
  slotDropId,
  type SlotDropData,
  slotItemId,
  type SlotItemDragData,
} from '@/ui/admin/fonts/dnd'
import { MAX_SLOT_FONTS, type SlotState, useFontSlotsController } from '@/ui/admin/fonts/font-slots'
import { FontUploadButton } from '@/ui/admin/fonts/FontUploadButton'
import { AdminListPage } from '@/ui/admin/shared/AdminListPage'
import { ConfirmDialog, type ConfirmState } from '@/ui/admin/shared/ConfirmDialog'
import { SortableDragHandle, sortableIndexOf, useSortableRow, useSortableSensors } from '@/ui/admin/shared/sortable'
import { Button } from '@/ui/components/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/components/card'
import { useI18n } from '@/ui/lib/I18nProvider'

const SLOT_LABEL_IDS: Record<FontSlot, UiMessageId> = {
  global: 'admin.fonts.slot.global',
  post: 'admin.fonts.slot.post',
  code: 'admin.fonts.slot.code',
}

const SLOT_DESCRIPTION_IDS: Record<FontSlot, UiMessageId> = {
  global: 'admin.fonts.slot.globalDesc',
  post: 'admin.fonts.slot.postDesc',
  code: 'admin.fonts.slot.codeDesc',
}

const SLOT_ORDER: FontSlot[] = ['global', 'post', 'code']

export function FontsView() {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const revalidator = useRevalidator()
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)

  const listQuery = useQuery(orpcQuery.admin.fonts.list.queryOptions({ input: {} }))

  const fonts = listQuery.data?.fonts ?? []

  const slotsController = useFontSlotsController()

  const deleteMutation = useMutation({
    mutationFn: (fontId: string) => orpc.admin.fonts.delete({ fontId }),
    onSuccess: () => {
      toast.success(t('admin.fonts.deleted'))
      // Invalidate via the procedure-level key — a hand-rolled array can't match TanStack's nested key grammar.
      void queryClient.invalidateQueries({ queryKey: orpcQuery.admin.fonts.list.key() })
      void revalidator.revalidate()
    },
    onError: onMutationError('admin.toast.deleteFailed', t),
  })

  const onDelete = (font: AdminFontDto) => {
    setConfirm({
      title: t('admin.fonts.deleteTitle'),
      description: t('admin.fonts.deleteBody', { name: font.familyName }),
      actionLabel: t('common.action.delete'),
      destructive: true,
      onConfirm: () => {
        deleteMutation.mutate(font.id)
      },
    })
  }

  const sensors = useSortableSensors()

  // Two-container drag: library rows drop only inside a slot rect (pointerWithin);
  // slot items reorder with closestCorners. Dispatch by active type keeps both correct.
  const collisionDetection: CollisionDetection = (args) => {
    const activeData = args.active.data.current
    const activeType =
      activeData && typeof activeData === 'object' ? (activeData as { type?: unknown }).type : undefined
    if (activeType === 'library') {
      const within = pointerWithin(args)
      // pointerWithin returns [] outside every droppable — pass through so a library drag never lands.
      return within.length > 0 ? within : []
    }
    return closestCorners(args)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over) {
      return
    }
    const activeData = active.data.current
    if (!isDragData(activeData)) {
      return
    }
    const overData = over.data.current

    // Resolve the target slot + insertion index: the slot container appends; an item targets its slot and index.
    let targetSlot: FontSlot | undefined
    let targetIndex: number | undefined
    if (isSlotItemData(overData)) {
      targetSlot = overData.slot
      targetIndex = sortableIndexOf(overData)
    } else if (isSlotDropData(overData)) {
      targetSlot = overData.slot
    }

    if (activeData.type === 'library') {
      if (!targetSlot) {
        return
      }
      slotsController.moveToSlot(activeData.fontId, targetSlot, targetIndex)
      return
    }

    const fromSlot = activeData.slot
    if (targetSlot && targetSlot !== fromSlot) {
      slotsController.moveToSlot(activeData.fontId, targetSlot, targetIndex, fromSlot)
      return
    }

    if (targetSlot && isSlotItemData(overData) && typeof targetIndex === 'number') {
      const fromIndex = slotsController.slots[fromSlot].indexOf(activeData.fontId)
      slotsController.reorder(fromSlot, fromIndex, targetIndex)
    }
  }

  return (
    <AdminListPage>
      <AdminListPage.Header title={t('admin.fonts.title')} description={t('admin.fonts.description')}>
        <FontUploadButton />
      </AdminListPage.Header>
      <AdminListPage.Body>
        <DndContext sensors={sensors} collisionDetection={collisionDetection} onDragEnd={handleDragEnd}>
          <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
            <LibrarySection fonts={fonts} onDelete={onDelete} loading={listQuery.isLoading} />
            <SlotAssignmentSection fonts={fonts} slots={slotsController.slots} onRemove={slotsController.remove} />
          </div>
        </DndContext>
      </AdminListPage.Body>
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </AdminListPage>
  )
}

function LibrarySection({
  fonts,
  onDelete,
  loading,
}: {
  fonts: AdminFontDto[]
  onDelete: (font: AdminFontDto) => void
  loading: boolean
}) {
  const { t } = useI18n()
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('admin.fonts.library.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">{t('common.state.loading')}</p>
        ) : fonts.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('admin.fonts.library.empty')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {fonts.map((font) => (
              <LibraryFontRow key={font.id} font={font} onDelete={onDelete} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function LibraryFontRow({ font, onDelete }: { font: AdminFontDto; onDelete: (font: AdminFontDto) => void }) {
  const { locale, t } = useI18n()
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: libDragId(font.id),
    data: { type: 'library', fontId: font.id } satisfies LibraryDragData,
  })
  const { 'aria-describedby': _removed, ...dragAttributes } = attributes
  void _removed
  const style = {
    transform: CSS.Transform.toString(transform),
  }
  return (
    <li
      ref={setNodeRef}
      style={style}
      className={
        'flex items-center justify-between gap-3 rounded-md border bg-card p-3 transition-colors' +
        (isDragging ? ' opacity-50' : ' hover:bg-muted/50')
      }
    >
      <button
        type="button"
        {...dragAttributes}
        {...listeners}
        className="shrink-0 cursor-grab text-muted-foreground active:cursor-grabbing"
        aria-label={t('admin.fonts.library.dragAria', { name: font.familyName })}
      >
        <GripVerticalIcon className="size-4" />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{font.familyName}</span>
          <span className="text-xs text-muted-foreground">{font.sourceName}</span>
        </div>
        <div className="text-xs text-muted-foreground">
          {t('admin.fonts.library.chunks', {
            chunks: font.chunkCount,
            bytes: formatBytes(font.totalBytes, { locale }),
          })}
        </div>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={t('admin.fonts.library.deleteAria', { name: font.familyName })}
        onClick={() => onDelete(font)}
      >
        <Trash2Icon className="text-destructive" />
      </Button>
    </li>
  )
}

function SlotAssignmentSection({
  fonts,
  slots,
  onRemove,
}: {
  fonts: AdminFontDto[]
  slots: SlotState
  onRemove: (slot: FontSlot, fontId: string) => void
}) {
  return (
    <div className="flex flex-col gap-4">
      {SLOT_ORDER.map((slot) => (
        <SlotColumn key={slot} slot={slot} fonts={fonts} assignedIds={slots[slot]} onRemove={onRemove} />
      ))}
    </div>
  )
}

function SlotColumn({
  slot,
  fonts,
  assignedIds,
  onRemove,
}: {
  slot: FontSlot
  fonts: AdminFontDto[]
  assignedIds: string[]
  onRemove: (slot: FontSlot, fontId: string) => void
}) {
  const { t } = useI18n()
  const { setNodeRef, isOver } = useDroppable({
    id: slotDropId(slot),
    data: { type: 'slot', slot } satisfies SlotDropData,
  })

  const assigned = assignedIds
    .map((id) => fonts.find((f) => f.id === id))
    .filter((f): f is AdminFontDto => f !== undefined)

  const itemIds = assigned.map((f) => slotItemId(slot, f.id))

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t(SLOT_LABEL_IDS[slot])}</CardTitle>
        <p className="text-xs text-muted-foreground">{t(SLOT_DESCRIPTION_IDS[slot])}</p>
      </CardHeader>
      <CardContent>
        <div
          ref={setNodeRef}
          className={
            'flex flex-col gap-1 rounded-md p-1.5 transition-colors' +
            (isOver ? ' bg-primary/5 ring-1 ring-primary/20 ring-inset' : '')
          }
        >
          {assigned.length === 0 ? (
            <p className="flex min-h-16 items-center justify-center rounded px-2 py-3 text-center text-sm text-muted-foreground">
              {t('admin.fonts.slot.empty')}
            </p>
          ) : (
            <>
              <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
                <ol className="flex flex-col gap-1">
                  {assigned.map((font) => (
                    <SlotFontRow key={font.id} slot={slot} font={font} onRemove={onRemove} />
                  ))}
                </ol>
              </SortableContext>
              {/* Trailing drop region for "append at the end". */}
              <div
                className={
                  'min-h-10 rounded px-2 py-1.5 text-center text-xs transition-colors' +
                  (isOver ? ' border border-dashed border-primary/30 text-primary/70' : ' text-muted-foreground/0')
                }
              >
                {isOver ? t('admin.fonts.slot.appendHint') : ''}
              </div>
            </>
          )}
          {assigned.length >= MAX_SLOT_FONTS && (
            <span className="mt-1 text-xs text-muted-foreground">
              {t('admin.fonts.slot.limit', { count: MAX_SLOT_FONTS })}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function SlotFontRow({
  slot,
  font,
  onRemove,
}: {
  slot: FontSlot
  font: AdminFontDto
  onRemove: (slot: FontSlot, fontId: string) => void
}) {
  const { t } = useI18n()
  const { setNodeRef, style, isDragging, dragHandleProps } = useSortableRow({
    id: slotItemId(slot, font.id),
    data: { type: 'slotItem', slot, fontId: font.id } satisfies SlotItemDragData,
  })
  return (
    <li
      ref={setNodeRef}
      style={style}
      className={
        'flex items-center gap-2 rounded-md border bg-card p-2 text-sm transition-colors' +
        (isDragging ? ' opacity-50' : ' hover:bg-muted/50')
      }
    >
      <SortableDragHandle {...dragHandleProps} />
      <span className="flex-1 truncate">{font.familyName}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={t('admin.fonts.slot.removeAria')}
        onClick={() => onRemove(slot, font.id)}
      >
        <XIcon className="text-destructive" />
      </Button>
    </li>
  )
}
