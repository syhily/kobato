import type { FontSlot } from '@/shared/types/fonts'

/**
 * Slot reference helpers for font packages.
 *
 * A font can belong to zero, one, or multiple of the three slots
 * (`global` / `post` / `code`). There is **no automatic garbage collection**
 * when a font is removed from a slot — the package stays in the library
 * until the user deletes it explicitly via the trash icon. The helpers here
 * are only used to guard the manual `deleteFont` path (it refuses to delete
 * a font that is still referenced by any slot).
 */

export interface SlotSnapshot {
  global: readonly string[]
  post: readonly string[]
  code: readonly string[]
}

export type { FontSlot }

/**
 * Total reference count of a font id across all three slots. A count of
 * zero means the font is unassigned and may be deleted via `fonts.delete`;
 * a non-zero count blocks deletion until the user detaches it from every
 * slot.
 */
export function referenceCount(slots: SlotSnapshot, fontId: string): number {
  let n = 0
  if (slots.global.includes(fontId)) {
    n++
  }
  if (slots.post.includes(fontId)) {
    n++
  }
  if (slots.code.includes(fontId)) {
    n++
  }
  return n
}
