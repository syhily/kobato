import { describe, expect, it } from 'vitest'

import {
  adjustInsertIndexForRemoval,
  createReorderGeometry,
  getInsertIndex,
  isReorderAllowed,
  resolveDrop,
  resolveReorder,
  type ReorderGeometry,
} from '@/utils/draggable/reorder-rules'

// Builds a container with `count` droppable divs and returns it with its
// children in document order — the stand-in for both the editor root's
// top-level blocks (vertical) and a gallery's [data-image] grid (horizontal).
function createDroppables(count: number) {
  const container = document.createElement('div')
  for (let i = 0; i < count; i += 1) {
    container.appendChild(document.createElement('div'))
  }
  document.body.appendChild(container)
  const droppables = Array.from(container.children) as HTMLElement[]
  return { container, droppables }
}

function fakeGeometry(droppables: HTMLElement[]): ReorderGeometry {
  return { getDroppables: () => droppables }
}

describe('reorder-rules', () => {
  describe('getInsertIndex', () => {
    it('vertical: top edge inserts before, bottom edge after', () => {
      expect(getInsertIndex(2, 'top-left', 'vertical')).toBe(2)
      expect(getInsertIndex(2, 'top-right', 'vertical')).toBe(2)
      expect(getInsertIndex(2, 'bottom-left', 'vertical')).toBe(3)
      expect(getInsertIndex(2, 'bottom-right', 'vertical')).toBe(3)
    })

    it('horizontal: left edge inserts before, right edge after', () => {
      expect(getInsertIndex(2, 'top-left', 'horizontal')).toBe(2)
      expect(getInsertIndex(2, 'bottom-left', 'horizontal')).toBe(2)
      expect(getInsertIndex(2, 'top-right', 'horizontal')).toBe(3)
      expect(getInsertIndex(2, 'bottom-right', 'horizontal')).toBe(3)
    })
  })

  describe('isReorderAllowed', () => {
    it('always allows external draggables (draggableIndex -1)', () => {
      expect(isReorderAllowed(-1, 0)).toBe(true)
      expect(isReorderAllowed(-1, 2)).toBe(true)
    })

    it('blocks landing on the dragged element’s own slot', () => {
      expect(isReorderAllowed(3, 3)).toBe(false)
    })

    it('blocks landing on the slot immediately after (no-op once removed)', () => {
      expect(isReorderAllowed(1, 2)).toBe(false)
    })

    it('allows genuine moves in either direction', () => {
      expect(isReorderAllowed(0, 2)).toBe(true)
      expect(isReorderAllowed(2, 0)).toBe(true)
    })
  })

  describe('resolveReorder (indicator path)', () => {
    it('resolves a vertical drop before another block', () => {
      const { droppables } = createDroppables(4)
      const resolution = resolveReorder(fakeGeometry(droppables), droppables[0], droppables[2], 'top-left', 'vertical')
      expect(resolution).toEqual({ draggableIndex: 0, insertIndex: 2 })
    })

    it('resolves a vertical drop after another block', () => {
      const { droppables } = createDroppables(4)
      const resolution = resolveReorder(
        fakeGeometry(droppables),
        droppables[0],
        droppables[2],
        'bottom-right',
        'vertical',
      )
      expect(resolution).toEqual({ draggableIndex: 0, insertIndex: 3 })
    })

    it('resolves a horizontal drop on the right edge of a gallery image', () => {
      const { droppables } = createDroppables(3)
      const resolution = resolveReorder(
        fakeGeometry(droppables),
        droppables[0],
        droppables[2],
        'top-right',
        'horizontal',
      )
      expect(resolution).toEqual({ draggableIndex: 0, insertIndex: 3 })
    })

    it('rejects dropping on the dragged element itself', () => {
      const { droppables } = createDroppables(3)
      expect(resolveReorder(fakeGeometry(droppables), droppables[1], droppables[1], 'top-left', 'vertical')).toBe(false)
      expect(resolveReorder(fakeGeometry(droppables), droppables[1], droppables[1], 'bottom-right', 'horizontal')).toBe(
        false,
      )
    })

    it('rejects drops that would leave the element where it already is', () => {
      const { droppables } = createDroppables(3)
      // before the next sibling → insertIndex === draggableIndex + 1
      expect(resolveReorder(fakeGeometry(droppables), droppables[0], droppables[1], 'top-left', 'vertical')).toBe(false)
      // after the previous sibling → insertIndex === draggableIndex
      expect(resolveReorder(fakeGeometry(droppables), droppables[1], droppables[0], 'bottom-left', 'vertical')).toBe(
        false,
      )
      // same no-ops horizontally
      expect(resolveReorder(fakeGeometry(droppables), droppables[0], droppables[1], 'top-left', 'horizontal')).toBe(
        false,
      )
      expect(resolveReorder(fakeGeometry(droppables), droppables[1], droppables[0], 'top-right', 'horizontal')).toBe(
        false,
      )
    })

    it('allows external draggables anywhere and reports draggableIndex -1', () => {
      const { droppables } = createDroppables(3)
      const outsider = document.createElement('div')
      expect(resolveReorder(fakeGeometry(droppables), outsider, droppables[1], 'top-left', 'vertical')).toEqual({
        draggableIndex: -1,
        insertIndex: 1,
      })
      expect(resolveReorder(fakeGeometry(droppables), null, droppables[1], 'bottom-left', 'vertical')).toEqual({
        draggableIndex: -1,
        insertIndex: 2,
      })
    })

    it('rejects when the droppable is not among the scanned droppables', () => {
      const { droppables } = createDroppables(3)
      const stranger = document.createElement('div')
      expect(resolveReorder(fakeGeometry(droppables), droppables[0], stranger, 'top-left', 'vertical')).toBe(false)
    })
  })

  describe('resolveDrop (drop path)', () => {
    it('verifies a previously derived insertIndex and returns a fresh scan', () => {
      const { droppables } = createDroppables(3)
      const resolution = resolveDrop(fakeGeometry(droppables), droppables[0], 3)
      expect(resolution).toEqual({ draggableIndex: 0, droppables })
    })

    it('rejects self-slot and no-op insertIndexes', () => {
      const { droppables } = createDroppables(3)
      expect(resolveDrop(fakeGeometry(droppables), droppables[1], 1)).toBe(false)
      expect(resolveDrop(fakeGeometry(droppables), droppables[1], 2)).toBe(false)
    })

    it('treats a null or unscanned element as external (always allowed)', () => {
      const { droppables } = createDroppables(3)
      expect(resolveDrop(fakeGeometry(droppables), null, 0)).toEqual({ draggableIndex: -1, droppables })
      const outsider = document.createElement('div')
      expect(resolveDrop(fakeGeometry(droppables), outsider, 2)).toEqual({ draggableIndex: -1, droppables })
    })
  })

  describe('adjustInsertIndexForRemoval', () => {
    it('shifts the slot down by one when the dragged element sits before it', () => {
      expect(adjustInsertIndexForRemoval(0, 3)).toBe(2)
      expect(adjustInsertIndexForRemoval(1, 2)).toBe(1) // unreachable in practice (disallowed), pinned for safety
    })

    it('leaves the slot alone when the dragged element sits at or after it', () => {
      expect(adjustInsertIndexForRemoval(2, 0)).toBe(0)
      expect(adjustInsertIndexForRemoval(2, 2)).toBe(2)
    })
  })

  describe('createReorderGeometry (default implementation)', () => {
    it('scans the container’s droppables in document order', () => {
      const { container, droppables } = createDroppables(3)
      const geometry = createReorderGeometry(container, ':scope > div')
      expect(geometry.getDroppables()).toEqual(droppables)
    })

    it('reflects DOM changes between scans', () => {
      const { container, droppables } = createDroppables(2)
      const geometry = createReorderGeometry(container, ':scope > div')
      droppables[0].remove()
      expect(geometry.getDroppables()).toEqual([droppables[1]])
    })

    it('returns an empty list for a null container', () => {
      expect(createReorderGeometry(null, ':scope > div').getDroppables()).toEqual([])
    })

    it('drives resolveReorder end-to-end through the live DOM', () => {
      const { container, droppables } = createDroppables(3)
      const resolution = resolveReorder(
        createReorderGeometry(container, ':scope > div'),
        droppables[2],
        droppables[0],
        'top-right',
        'vertical',
      )
      expect(resolution).toEqual({ draggableIndex: 2, insertIndex: 0 })
    })
  })
})
