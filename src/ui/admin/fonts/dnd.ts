import type { FontSlot } from '@/shared/contracts/fonts'

// Drag-and-drop protocol for the fonts view: the discriminated payloads
// stored in `useDraggable`/`useSortable` `.data` so `handleDragEnd` can
// dispatch without re-deriving intent, plus the guards that narrow dnd-kit's
// arbitrary `.data` back to those tagged unions (no casts), and the id
// builders shared by rows, drop zones, and the drag-end handler.

export type LibraryDragData = { type: 'library'; fontId: string }
export type SlotItemDragData = { type: 'slotItem'; slot: FontSlot; fontId: string }
export type SlotDropData = { type: 'slot'; slot: FontSlot }
export type DragData = LibraryDragData | SlotItemDragData

const FONT_SLOTS: ReadonlySet<string> = new Set(['global', 'post', 'code'])

function isFontSlot(value: unknown): value is FontSlot {
  return typeof value === 'string' && FONT_SLOTS.has(value)
}

export function isDragData(value: unknown): value is DragData {
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

export function isSlotItemData(value: unknown): value is SlotItemDragData {
  return isDragData(value) && value.type === 'slotItem'
}

export function isSlotDropData(value: unknown): value is SlotDropData {
  if (!value || typeof value !== 'object') {
    return false
  }
  const v = value as { type?: unknown; slot?: unknown }
  return v.type === 'slot' && isFontSlot(v.slot)
}

export const libDragId = (fontId: string) => `lib:${fontId}` as const
export const slotItemId = (slot: FontSlot, fontId: string) => `slot:${slot}:${fontId}` as const
export const slotDropId = (slot: FontSlot) => `dropzone:${slot}` as const
