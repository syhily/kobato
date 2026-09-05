import { describe, expect, it } from 'vitest'

import { initialSlot, nextSlot, previousSlot, slotToItemIndex } from '@/components/ui/SnippetInput/snippet-navigator'

describe('snippet navigator', () => {
  it('starts on the first item when the query matches, on the create button otherwise', () => {
    expect(initialSlot(3)).toBe(1)
    expect(initialSlot(0)).toBe(0)
  })

  it('walks down through the items and wraps to the create button', () => {
    // ring for 2 items: 1 → 2 → 0 → 1
    expect(nextSlot(1, 2)).toBe(2)
    expect(nextSlot(2, 2)).toBe(0)
    expect(nextSlot(0, 2)).toBe(1)
  })

  it('walks up through the create button and wraps to the last item', () => {
    // ring for 2 items: 1 → 0 → 2 → 1
    expect(previousSlot(1, 2)).toBe(0)
    expect(previousSlot(0, 2)).toBe(2)
    expect(previousSlot(2, 2)).toBe(1)
  })

  it('maps slots to item indices, with -1 for the create button', () => {
    expect(slotToItemIndex(0)).toBe(-1)
    expect(slotToItemIndex(1)).toBe(0)
    expect(slotToItemIndex(2)).toBe(1)
  })
})
