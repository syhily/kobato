import type { AdminFontDto, FontSlot } from '@kobato/shared/contracts/fonts'

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
import { orpc } from '@kobato/client/api/client'
import { orpcQuery } from '@kobato/client/api/orpc-query'
import { toastApiError } from '@kobato/client/lib/toast-api-error'
import { formatBytes } from '@kobato/shared/utils/formatter'
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
} from '@kobato/ui/admin/fonts/dnd'
import { MAX_SLOT_FONTS, type SlotState, useFontSlotsController } from '@kobato/ui/admin/fonts/font-slots'
import { FontUploadButton } from '@kobato/ui/admin/fonts/FontUploadButton'
import { AdminListPage } from '@kobato/ui/admin/shared/AdminListPage'
import { ConfirmDialog, type ConfirmState } from '@kobato/ui/admin/shared/ConfirmDialog'
import {
  SortableDragHandle,
  sortableIndexOf,
  useSortableRow,
  useSortableSensors,
} from '@kobato/ui/admin/shared/sortable'
import { Button } from '@kobato/ui/components/button'
import { Card, CardContent, CardHeader, CardTitle } from '@kobato/ui/components/card'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { GripVerticalIcon, Trash2Icon, XIcon } from 'lucide-react'
import { useState } from 'react'
import { useRevalidator } from 'react-router'
import { toast } from 'sonner'

// Self-hosted web-font library + slot assignment: a library grid (draggable
// into a slot, delete refuses if referenced), the `FontUploadButton` upload
// dialog, and three slot columns (global / post / code) persisted directly
// via `admin.fonts.setSlot` (NOT the settings autosave path) + revalidate.

const SLOT_LABELS: Record<FontSlot, string> = {
  global: '全站',
  post: '文章正文',
  code: '代码',
}

const SLOT_DESCRIPTIONS: Record<FontSlot, string> = {
  global: '所有页面加载，覆盖 UI 界面字体。',
  post: '仅文章详情页加载，覆盖正文字体。',
  code: '文章详情页加载，覆盖代码块字体。',
}

const SLOT_ORDER: FontSlot[] = ['global', 'post', 'code']

export function FontsView() {
  const queryClient = useQueryClient()
  const revalidator = useRevalidator()
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)

  const listQuery = useQuery(orpcQuery.admin.fonts.list.queryOptions({ input: {} }))

  const fonts = listQuery.data?.fonts ?? []

  const slotsController = useFontSlotsController()

  const deleteMutation = useMutation({
    mutationFn: (fontId: string) => orpc.admin.fonts.delete({ fontId }),
    onSuccess: () => {
      toast.success('字体已删除')
      // Invalidate via the procedure-level orpcQuery key — a hand-rolled
      // ['admin','fonts','list'] array can't match TanStack's nested key
      // grammar and would leave the list stale forever.
      void queryClient.invalidateQueries({ queryKey: orpcQuery.admin.fonts.list.key() })
      void revalidator.revalidate()
    },
    onError: (error) => {
      toastApiError(error, '删除失败')
    },
  })

  const onDelete = (font: AdminFontDto) => {
    setConfirm({
      title: '删除字体',
      description: `确认删除「${font.familyName}」？若字体被任意槽位引用，请先从槽位移除。`,
      actionLabel: '删除',
      destructive: true,
      onConfirm: () => {
        deleteMutation.mutate(font.id)
      },
    })
  }

  const sensors = useSortableSensors()

  // The drag spans two containers: library rows only drop when the pointer
  // is inside a slot rect (pointerWithin); slot items reorder with the
  // "nearest corner" looseness of closestCorners. Dispatching by active
  // type keeps both correct — closestCorners alone would land a library
  // drag in the nearest slot without the pointer ever entering it.
  const collisionDetection: CollisionDetection = (args) => {
    const activeData = args.active.data.current
    const activeType =
      activeData && typeof activeData === 'object' ? (activeData as { type?: unknown }).type : undefined
    if (activeType === 'library') {
      const within = pointerWithin(args)
      // pointerWithin already returns [] when the pointer is outside every
      // droppable — pass it through so a library drag never lands.
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

    // Resolve the target slot + insertion index from the drop target: the
    // slot container appends; an item targets its slot and index.
    let targetSlot: FontSlot | undefined
    let targetIndex: number | undefined
    if (isSlotItemData(overData)) {
      targetSlot = overData.slot
      targetIndex = sortableIndexOf(overData)
    } else if (isSlotDropData(overData)) {
      targetSlot = overData.slot
    }

    if (activeData.type === 'library') {
      // Library → slot: append at the resolved position (dedupe + cap).
      if (!targetSlot) {
        return
      }
      slotsController.moveToSlot(activeData.fontId, targetSlot, targetIndex)
      return
    }

    // slotItem drag: reorder within, or move across slots.
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
      <AdminListPage.Header
        title="网站字体"
        description="上传 TTF/OTF 自动分包为 woff2，分配到全站 / 文章 / 代码槽位。"
      >
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

// ---- library section -------------------------------------------------------

function LibrarySection({
  fonts,
  onDelete,
  loading,
}: {
  fonts: AdminFontDto[]
  onDelete: (font: AdminFontDto) => void
  loading: boolean
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>已上传字体</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">加载中…</p>
        ) : fonts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            还没有上传字体。点击右上角「上传字体」添加一个 .ttf 或 .otf 文件。
          </p>
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
        aria-label={`拖拽 ${font.familyName} 到槽位`}
      >
        <GripVerticalIcon className="size-4" />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{font.familyName}</span>
          <span className="text-xs text-muted-foreground">{font.sourceName}</span>
        </div>
        <div className="text-xs text-muted-foreground">
          {font.chunkCount} 个分包 · {formatBytes(font.totalBytes)}
        </div>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`删除 ${font.familyName}`}
        onClick={() => onDelete(font)}
      >
        <Trash2Icon className="text-destructive" />
      </Button>
    </li>
  )
}

// ---- slot assignment -------------------------------------------------------

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
        <CardTitle>{SLOT_LABELS[slot]}</CardTitle>
        <p className="text-xs text-muted-foreground">{SLOT_DESCRIPTIONS[slot]}</p>
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
              该槽位暂无字体，拖拽左侧字体到此处添加。
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
              {/* Trailing drop region for "append at the end" — the dashed
                  outline only surfaces while dragging over. */}
              <div
                className={
                  'min-h-10 rounded px-2 py-1.5 text-center text-xs transition-colors' +
                  (isOver ? ' border border-dashed border-primary/30 text-primary/70' : ' text-muted-foreground/0')
                }
              >
                {isOver ? '拖到此处追加到末尾' : ''}
              </div>
            </>
          )}
          {assigned.length >= MAX_SLOT_FONTS && (
            <span className="mt-1 text-xs text-muted-foreground">已达上限 {MAX_SLOT_FONTS} 个</span>
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
      <Button type="button" variant="ghost" size="icon" aria-label="移除" onClick={() => onRemove(slot, font.id)}>
        <XIcon className="text-destructive" />
      </Button>
    </li>
  )
}
