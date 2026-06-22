import { describe, expect, it } from 'vitest'

import type { SlotSnapshot } from '@/server/domains/fonts/slot-gc'

import { referenceCount } from '@/server/domains/fonts/slot-gc'

// Pure-logic tests for the slot reference helpers. No DB, no I/O. There is
// no automatic GC on slot edits — fonts are only deleted via the explicit
// `fonts.delete` path, which `referenceCount` guards against deleting a
// font still referenced by some slot.

const A = '00000000-0000-4000-8000-00000000000a'

function snapshot(partial: Partial<SlotSnapshot> = {}): SlotSnapshot {
  return { global: [], post: [], code: [], ...partial }
}

describe('referenceCount', () => {
  it('counts zero for an unassigned font', () => {
    expect(referenceCount(snapshot(), A)).toBe(0)
  })

  it('counts one for a font in a single slot', () => {
    expect(referenceCount(snapshot({ global: [A] }), A)).toBe(1)
  })

  it('counts three for a font in every slot', () => {
    expect(referenceCount(snapshot({ global: [A], post: [A], code: [A] }), A)).toBe(3)
  })

  it('counts each slot independently even with duplicates within a slot', () => {
    // Defensive: duplicates within one slot count once per slot at most,
    // because `.includes()` is boolean. (Slot lists are UUID arrays and the
    // admin UI prevents dupes, but the count must stay correct regardless.)
    expect(referenceCount(snapshot({ global: [A, A], post: [A] }), A)).toBe(2)
  })
})
