import {
  closestCorners,
  type CollisionDetection,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CircleAlertIcon,
  CircleCheckIcon,
  GripVerticalIcon,
  Loader2Icon,
  Trash2Icon,
  UploadIcon,
  XIcon,
} from 'lucide-react'
import { useRef, useState, useEffect, useReducer } from 'react'
import { useRouteLoaderData, useRevalidator } from 'react-router'
import { toast } from 'sonner'

import type { FontsSettings } from '@/shared/config/types'
import type { AdminFontDto, FontSlot } from '@/shared/types/fonts'

import { orpc } from '@/client/api/client'
import { orpcQuery } from '@/client/api/orpc-query'
import { formatBytes } from '@/shared/utils/formatter'
import { invalidateFontsList } from '@/ui/admin/fonts/fonts-cache'
import { AdminListPage } from '@/ui/admin/shared/AdminListPage'
import { ConfirmDialog, type ConfirmState } from '@/ui/admin/shared/ConfirmDialog'
import { Button } from '@/ui/components/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/components/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/ui/components/dialog'
import { Input } from '@/ui/components/input'
import { extractApiErrorMessage } from '@/ui/lib/api-error'

// Self-hosted web-font library + slot assignment. Three concerns:
//  1. Library grid — every uploaded font; draggable into a slot, with delete
//     (refuses if referenced).
//  2. Upload — POST a .ttf/.otf to the package upload route; slicing is
//     synchronous server-side (~15–20s for CJK), so the button shows a
//     spinner and is disabled until the response returns.
//  3. Slot assignment — three columns (global / post / code); each is an
//     ordered list of font ids. Drag to assign / reorder, click ✕ to remove.
//     Add/remove/reorder call `admin.fonts.setSlot` directly (NOT the
//     settings autosave path) and revalidate.

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
const MAX_SLOT_FONTS = 8

// Drag-item discriminated payloads, stored in `useDraggable`/`useSortable`
// `.data` so `handleDragEnd` can dispatch without re-deriving intent.
type LibraryDragData = { type: 'library'; fontId: string }
type SlotItemDragData = { type: 'slotItem'; slot: FontSlot; fontId: string }
type SlotDropData = { type: 'slot'; slot: FontSlot }
type DragData = LibraryDragData | SlotItemDragData

// dnd-kit stores arbitrary `.data` on draggables/droppables; narrow it back
// to our tagged unions in `handleDragEnd` via these guards instead of casts.
const FONT_SLOTS: ReadonlySet<string> = new Set(['global', 'post', 'code'])
function isFontSlot(value: unknown): value is FontSlot {
  return typeof value === 'string' && FONT_SLOTS.has(value)
}
function isDragData(value: unknown): value is DragData {
  if (!value || typeof value !== 'object') {
    return false
  }
  const v = value as { type?: unknown; fontId?: unknown; slot?: unknown }
  if (v.type === 'library') {
    return typeof v.fontId === 'string'
  }
  if (v.type === 'slotItem') {
    return typeof v.fontId === 'string' && isFontSlot(v.slot)
  }
  return false
}
function isSlotItemData(value: unknown): value is SlotItemDragData {
  return isDragData(value) && value.type === 'slotItem'
}
function isSlotDropData(value: unknown): value is SlotDropData {
  if (!value || typeof value !== 'object') {
    return false
  }
  const v = value as { type?: unknown; slot?: unknown }
  return v.type === 'slot' && isFontSlot(v.slot)
}

// `useSortable` augments `.data` with a `sortable.index` field at runtime.
// Read it without narrowing the whole object — we only need the number.
function sortableIndexOf(value: object): number | undefined {
  const maybe = value as { sortable?: { index?: unknown } } | Record<string, never>
  const index = maybe.sortable?.index
  return typeof index === 'number' ? index : undefined
}

const libDragId = (fontId: string) => `lib:${fontId}` as const
const slotItemId = (slot: FontSlot, fontId: string) => `slot:${slot}:${fontId}` as const
const slotDropId = (slot: FontSlot) => `dropzone:${slot}` as const

type SlotState = Record<FontSlot, string[]>

function emptySlots(): SlotState {
  return { global: [], post: [], code: [] }
}

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
      void invalidateFontsList(queryClient)
      void revalidator.revalidate()
    },
    onError: (error) => {
      toast.error('删除失败', { description: extractApiErrorMessage(error) })
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

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // The drag spans two containers with opposite intents:
  //  - Library rows (left) are draggable but never droppable. Dropping one
  //    into a slot only counts when the pointer is *inside* the slot rect.
  //  - Slot items (right) sort within their own column; reorder wants the
  //    "nearest corner" looseness `closestCorners` provides.
  // `closestCorners` alone returns the nearest slot even when the pointer is
  // still hovering the library column, so a drag started on the left would
  // "land" in a slot on drop without ever entering it. Dispatching by active
  // type keeps both behaviors correct.
  const collisionDetection: CollisionDetection = (args) => {
    const activeData = args.active.data.current
    const activeType =
      activeData && typeof activeData === 'object' ? (activeData as { type?: unknown }).type : undefined
    if (activeType === 'library') {
      const within = pointerWithin(args)
      // Fall back to closestCorners only if the pointer is genuinely inside a
      // droppable — pointerWithin already returns [] when it isn't, so the
      // fallback here just ranks multiple overlapping slots.
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

    // Resolve the target slot + insertion index from whatever we landed on.
    // Landing on the slot container itself appends; landing on an item
    // targets that item's slot and uses its index.
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
        <UploadButton />
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

// ─── slots controller ──────────────────────────────────────────────────
// Drags need an optimistic local mirror of `blogSettings.fonts` so the item
// doesn't snap back to its old slot while `setSlot` round-trips. A reducer
// owns the state; the `seeded` action rewrites it from the server, but only
// when no mutation is in flight (`inFlight > 0`) — otherwise a revalidate
// triggered mid-sequence would clobber the optimistic state (same trade-off
// as the settings reseed guard).

type SlotsAction =
  | { type: 'seeded'; slots: SlotState }
  | { type: 'setSlot'; slot: FontSlot; ids: string[] }
  | { type: 'reorder'; slot: FontSlot; from: number; to: number }
  | { type: 'move'; fontId: string; target: FontSlot; index: number | undefined; from?: FontSlot }
  | { type: 'remove'; slot: FontSlot; fontId: string }

function slotsReducer(state: SlotState, action: SlotsAction): SlotState {
  switch (action.type) {
    case 'seeded':
      return action.slots
    case 'setSlot':
      return { ...state, [action.slot]: action.ids }
    case 'reorder': {
      const next = arrayMove(state[action.slot], action.from, action.to)
      return { ...state, [action.slot]: next }
    }
    case 'move': {
      const next = { ...state }
      if (action.from && action.from !== action.target) {
        next[action.from] = state[action.from].filter((id) => id !== action.fontId)
      }
      const target = next[action.target].filter((id) => id !== action.fontId)
      const insertAt = action.index === undefined || action.index >= target.length ? target.length : action.index
      target.splice(insertAt, 0, action.fontId)
      next[action.target] = target
      return next
    }
    case 'remove':
      return { ...state, [action.slot]: state[action.slot].filter((id) => id !== action.fontId) }
  }
}

function useFontSlotsController() {
  const rootData = useRouteLoaderData<{ blogSettings?: { fonts?: FontsSettings } | null }>('root')
  const serverSlots = rootData?.blogSettings?.fonts
  const revalidator = useRevalidator()
  const queryClient = useQueryClient()
  const [slots, dispatch] = useReducer(slotsReducer, undefined, emptySlots)
  const inFlightRef = useRef(0)

  // Seed from server, but skip while a mutation is in flight so the
  // optimistic state survives the revalidate that fires on success.
  useEffect(() => {
    if (inFlightRef.current > 0) {
      return
    }
    if (!serverSlots) {
      return
    }
    dispatch({
      type: 'seeded',
      slots: {
        global: serverSlots.global ?? [],
        post: serverSlots.post ?? [],
        code: serverSlots.code ?? [],
      },
    })
  }, [serverSlots])

  const setSlotMutation = useMutation({
    mutationFn: (args: { slot: FontSlot; fontIds: string[] }) =>
      orpc.admin.fonts.setSlot({ slot: args.slot, fontIds: args.fontIds }),
    onMutate: () => {
      inFlightRef.current += 1
    },
    onSuccess: () => {
      inFlightRef.current = Math.max(0, inFlightRef.current - 1)
      void invalidateFontsList(queryClient)
      void revalidator.revalidate()
    },
    onError: (error) => {
      inFlightRef.current = Math.max(0, inFlightRef.current - 1)
      void revalidator.revalidate()
      toast.error('槽位更新失败', { description: extractApiErrorMessage(error) })
    },
  })

  const persist = (slot: FontSlot, ids: string[]) => {
    setSlotMutation.mutate({ slot, fontIds: ids })
  }

  const commit = (slot: FontSlot, next: string[]) => {
    dispatch({ type: 'setSlot', slot, ids: next })
    persist(slot, next)
  }

  const reorder = (slot: FontSlot, from: number, to: number) => {
    if (from < 0 || from === to) {
      return
    }
    const next = arrayMove(slots[slot], from, to)
    commit(slot, next)
  }

  const moveToSlot = (fontId: string, targetSlot: FontSlot, targetIndex: number | undefined, fromSlot?: FontSlot) => {
    if (slots[targetSlot].includes(fontId) && fromSlot !== targetSlot) {
      toast.error('该字体已在目标槽位中')
      return
    }
    if (slots[targetSlot].length >= MAX_SLOT_FONTS && !slots[targetSlot].includes(fontId)) {
      toast.error(`每个槽位最多 ${MAX_SLOT_FONTS} 个字体`)
      return
    }

    // Compute the post-move state once, then dispatch + persist from it
    // (avoids reading a stale `slots` for the mutation payload).
    const next: SlotState = { ...slots }
    if (fromSlot && fromSlot !== targetSlot) {
      next[fromSlot] = slots[fromSlot].filter((id) => id !== fontId)
    }
    const target = next[targetSlot].filter((id) => id !== fontId)
    const insertAt = targetIndex === undefined || targetIndex >= target.length ? target.length : targetIndex
    target.splice(insertAt, 0, fontId)
    next[targetSlot] = target

    dispatch({ type: 'move', fontId, target: targetSlot, index: targetIndex, from: fromSlot })
    if (fromSlot && fromSlot !== targetSlot) {
      persist(fromSlot, next[fromSlot])
    }
    persist(targetSlot, next[targetSlot])
  }

  const remove = (slot: FontSlot, fontId: string) => {
    commit(
      slot,
      slots[slot].filter((id) => id !== fontId),
    )
  }

  return { slots, commit, reorder, moveToSlot, remove, isPending: setSlotMutation.isPending }
}

// Upload dialog phases. A single dialog transitions from name input through
// upload progress to a terminal success/error result.
type UploadPhase =
  | { kind: 'idle' }
  | { kind: 'input'; file: File; familyName: string }
  | { kind: 'uploading'; fileName: string; familyName: string }
  | { kind: 'success'; familyName: string }
  | { kind: 'error'; familyName: string; message: string }

function UploadButton() {
  // The upload hits the dedicated resource route (not oRPC) because source
  // fonts can be 60 MiB and the oRPC bridge sits behind the request-wide
  // body limit. Mirrors the canvas-font upload at the legacy /api/admin/
  // fonts/upload route.
  const revalidator = useRevalidator()
  const queryClient = useQueryClient()
  const rootData = useRouteLoaderData<{ csrfToken?: string }>('root')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const familyInputRef = useRef<HTMLInputElement>(null)
  const [phase, setPhase] = useState<UploadPhase>({ kind: 'idle' })

  const dialogOpen = phase.kind !== 'idle'

  // Focus the family-name input when the dialog enters the input phase.
  useEffect(() => {
    if (phase.kind === 'input') {
      const id = requestAnimationFrame(() => familyInputRef.current?.focus())
      return () => cancelAnimationFrame(id)
    }
  }, [phase.kind])

  // Reset everything when the dialog closes.
  const reset = () => setPhase({ kind: 'idle' })

  // ---- upload runner -------------------------------------------------------

  const startUpload = async (file: File, familyName: string) => {
    const lower = file.name.toLowerCase()
    if (!lower.endsWith('.ttf') && !lower.endsWith('.otf')) {
      setPhase({ kind: 'error', familyName, message: '仅支持 .ttf 或 .otf 字体文件' })
      return
    }
    if (file.size > 60 * 1024 * 1024) {
      setPhase({ kind: 'error', familyName, message: '字体文件大小上限为 60 MB' })
      return
    }
    if (familyName.trim() === '') {
      setPhase({ kind: 'error', familyName, message: '请填写字体族名' })
      return
    }

    setPhase({ kind: 'uploading', fileName: file.name, familyName })
    const formData = new FormData()
    formData.append('file', file)
    formData.append('familyName', familyName.trim())
    const headers: Record<string, string> = {}
    if (rootData?.csrfToken) {
      headers['x-csrf-token'] = rootData.csrfToken
    }
    try {
      const res = await fetch('/api/admin/fonts/package/upload', {
        method: 'POST',
        body: formData,
        headers,
      })
      if (!res.ok) {
        const data: unknown = await res.json().catch(() => null)
        throw new Error(extractApiErrorMessage(data) ?? `服务器错误 (${res.status})`)
      }
      await invalidateFontsList(queryClient)
      void revalidator.revalidate()
      setPhase({ kind: 'success', familyName: familyName.trim() })
    } catch (err) {
      setPhase({
        kind: 'error',
        familyName: familyName.trim(),
        message: err instanceof Error ? err.message : '未知错误，请稍后重试',
      })
    }
  }

  // ---- event handlers ------------------------------------------------------

  const onFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) {
      setPhase({
        kind: 'input',
        file: f,
        familyName: f.name.replace(/\.(ttf|otf)$/i, ''),
      })
    }
    e.target.value = ''
  }

  // ---- render --------------------------------------------------------------

  return (
    <>
      <input ref={fileInputRef} type="file" accept=".ttf,.otf" hidden onChange={onFileSelected} />
      <Button type="button" onClick={() => fileInputRef.current?.click()}>
        <UploadIcon data-icon="sm" />
        上传字体
      </Button>

      <Dialog open={dialogOpen} onOpenChange={(open) => !open && reset()}>
        <DialogContent className="sm:max-w-sm" showCloseButton={phase.kind !== 'uploading'}>
          {phase.kind === 'input' && (
            <UploadInputPhase
              familyName={phase.familyName}
              fileName={phase.file.name}
              familyInputRef={familyInputRef}
              onFamilyNameChange={(name) => setPhase({ ...phase, familyName: name })}
              onCancel={reset}
              onUpload={() => {
                void startUpload(phase.file, phase.familyName)
              }}
            />
          )}
          {phase.kind === 'uploading' && (
            <UploadProgressPhase fileName={phase.fileName} familyName={phase.familyName} />
          )}
          {phase.kind === 'success' && <UploadSuccessPhase familyName={phase.familyName} onClose={reset} />}
          {phase.kind === 'error' && (
            <UploadErrorPhase familyName={phase.familyName} message={phase.message} onClose={reset} />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

// ---- phase sub-components --------------------------------------------------

function UploadInputPhase({
  familyName,
  fileName,
  familyInputRef,
  onFamilyNameChange,
  onCancel,
  onUpload,
}: {
  familyName: string
  fileName: string
  familyInputRef: React.RefObject<HTMLInputElement | null>
  onFamilyNameChange: (name: string) => void
  onCancel: () => void
  onUpload: () => void
}) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>上传网站字体</DialogTitle>
        <DialogDescription>
          文件：{fileName}
          <br />
          请输入字体族名，用于 CSS font-family 属性。
        </DialogDescription>
      </DialogHeader>
      <Input
        ref={familyInputRef}
        value={familyName}
        onChange={(e) => onFamilyNameChange(e.target.value)}
        placeholder="例如：OPPOSans"
        maxLength={100}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            onUpload()
          }
        }}
      />
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          取消
        </Button>
        <Button onClick={onUpload} disabled={familyName.trim() === ''}>
          上传
        </Button>
      </DialogFooter>
    </>
  )
}

function UploadProgressPhase({ fileName, familyName }: { fileName: string; familyName: string }) {
  return (
    <div className="flex flex-col items-center gap-4 py-4">
      <Loader2Icon className="size-10 animate-spin text-primary" />
      <div className="text-center">
        <p className="font-semibold">处理中…</p>
        <p className="mt-1 text-sm text-muted-foreground">分包可能需要数十秒，请耐心等待。</p>
      </div>
      <div className="w-full rounded-md border bg-muted/50 px-3 py-2 text-sm">
        <p>
          <span className="text-muted-foreground">文件：</span>
          {fileName}
        </p>
        <p>
          <span className="text-muted-foreground">族名：</span>
          {familyName}
        </p>
      </div>
    </div>
  )
}

function UploadSuccessPhase({ familyName, onClose }: { familyName: string; onClose: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 py-4">
      <CircleCheckIcon className="size-10 text-emerald-500" />
      <div className="text-center">
        <p className="font-semibold">上传成功</p>
        <p className="mt-1 text-sm text-muted-foreground">「{familyName}」已添加到网站字体库。</p>
      </div>
      <DialogFooter className="w-full">
        <Button onClick={onClose} className="w-full">
          关闭
        </Button>
      </DialogFooter>
    </div>
  )
}

function UploadErrorPhase({
  familyName,
  message,
  onClose,
}: {
  familyName: string
  message: string
  onClose: () => void
}) {
  return (
    <div className="flex flex-col gap-4 py-4">
      <div className="flex flex-col items-center gap-3">
        <CircleAlertIcon className="size-10 text-destructive" />
        <div className="text-center">
          <p className="font-semibold">上传失败</p>
          <p className="mt-1 text-sm text-muted-foreground">「{familyName}」未能完成上传。</p>
        </div>
      </div>
      <div className="w-full rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
        {message}
      </div>
      <DialogFooter>
        <Button onClick={onClose} className="w-full">
          关闭
        </Button>
      </DialogFooter>
    </div>
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
              {/* Trailing drop region: gives a visible target to "append at
                  the end" instead of forcing the user to hit an existing row.
                  The dashed outline only surfaces while dragging over so the
                  filled slot still reads as a tidy list at rest. */}
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
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: slotItemId(slot, font.id),
    data: { type: 'slotItem', slot, fontId: font.id } satisfies SlotItemDragData,
  })
  const { 'aria-describedby': _removed, ...dragAttributes } = attributes
  void _removed
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }
  return (
    <li
      ref={setNodeRef}
      style={style}
      className={
        'flex items-center gap-2 rounded-md border bg-card p-2 text-sm transition-colors' +
        (isDragging ? ' opacity-50' : ' hover:bg-muted/50')
      }
    >
      <button
        type="button"
        {...dragAttributes}
        {...listeners}
        className="shrink-0 cursor-grab text-muted-foreground active:cursor-grabbing"
        aria-label="拖拽排序"
      >
        <GripVerticalIcon className="size-4" />
      </button>
      <span className="flex-1 truncate">{font.familyName}</span>
      <Button type="button" variant="ghost" size="icon" aria-label="移除" onClick={() => onRemove(slot, font.id)}>
        <XIcon className="text-destructive" />
      </Button>
    </li>
  )
}
