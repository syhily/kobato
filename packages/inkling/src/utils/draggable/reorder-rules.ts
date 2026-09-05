import type { DroppablePosition } from '@/utils/draggable/DragDropContainer'

// Headless reorder rules for drag-drop: drop allowance and insert-index math
// for both drag directions — vertical card reorder in the editor root
// (DragDropReorderPlugin) and horizontal image reorder inside a gallery
// (useGalleryReorder). Everything DOM-shaped sits behind the ReorderGeometry
// seam (the CardAdjacencyGeometry pattern from
// @/plugins/behaviour/card-adjacency), so the rules are unit-testable without
// layout. The plugin and the hook are adapters over this module: they keep
// their DOM/Lexical glue, the rules come from here.
//
// insertIndex is derived exactly once per drag — by resolveReorder on the
// indicator path — and the DragDropHandler hands it to the drop path as the
// onDrop resolution argument; resolveDrop only re-verifies it against a
// fresh scan, it never derives one.
//
// This module is deliberately NOT vendor-synced with inkling-card-gallery:
// the drop-allowance rule used to live in draggable-utils.ts mirrored across
// both repos; it is consolidated here (the gallery repo keeps its own
// direction-specific copy). See the header in draggable-utils.ts.

export type ReorderDirection = 'vertical' | 'horizontal'

/**
 * Geometry seam for the reorder rules: the ordered droppable elements of the
 * container being dragged over. The default implementation
 * (createReorderGeometry) performs the live DOM scan; tests inject fakes.
 */
export interface ReorderGeometry {
  /** Droppable elements in document order. */
  getDroppables(): HTMLElement[]
}

/** Default ReorderGeometry: a live querySelectorAll scan of the container's droppables. */
export function createReorderGeometry(container: HTMLElement | null, droppableSelector: string): ReorderGeometry {
  return {
    getDroppables() {
      return container ? Array.from(container.querySelectorAll<HTMLElement>(droppableSelector)) : []
    },
  }
}

/**
 * The slot the dragged element would occupy when dropped on `position` of the
 * droppable at `droppableIndex`: the droppable's own slot on its leading edge
 * (top / left), the next slot on its trailing edge (bottom / right).
 */
export function getInsertIndex(
  droppableIndex: number,
  position: DroppablePosition,
  direction: ReorderDirection,
): number {
  const onTrailingEdge = direction === 'vertical' ? position.startsWith('bottom') : position.endsWith('right')
  return onTrailingEdge ? droppableIndex + 1 : droppableIndex
}

/**
 * Whether inserting at `insertIndex` is a real move. External draggables
 * (draggableIndex -1 — the dragged element is not one of the scanned
 * droppables, e.g. an image dragged out of a gallery) may drop anywhere. An
 * internal drag is a no-op when it lands on its own slot or the slot
 * immediately after it (removing the element first shifts that slot back onto
 * its own position).
 */
export function isReorderAllowed(draggableIndex: number, insertIndex: number): boolean {
  if (draggableIndex === -1) {
    return true
  }
  return insertIndex !== draggableIndex && insertIndex !== draggableIndex + 1
}

export interface ReorderResolution {
  /** Index of the dragged element among the droppables; -1 for external draggables. */
  draggableIndex: number
  insertIndex: number
}

/**
 * Indicator-path resolution: where a drop on `position` of `droppableElement`
 * would land, or false when the drop is not allowed. This is the only
 * insertIndex derivation — the drop path consumes the value produced here.
 */
export function resolveReorder(
  geometry: ReorderGeometry,
  draggableElement: HTMLElement | null,
  droppableElement: HTMLElement,
  position: DroppablePosition,
  direction: ReorderDirection,
): ReorderResolution | false {
  const droppables = geometry.getDroppables()
  const droppableIndex = droppables.indexOf(droppableElement)
  if (droppableIndex === -1) {
    return false
  }
  const draggableIndex = draggableElement ? droppables.indexOf(draggableElement) : -1
  const insertIndex = getInsertIndex(droppableIndex, position, direction)
  if (!isReorderAllowed(draggableIndex, insertIndex)) {
    return false
  }
  return { draggableIndex, insertIndex }
}

export interface DropResolution {
  /** Index of the dragged element among the droppables; -1 for external draggables. */
  draggableIndex: number
  /** Fresh scan taken at drop time — callers map insertIndex onto these elements. */
  droppables: HTMLElement[]
}

/**
 * Drop-path verification: re-checks a previously derived insertIndex against
 * a fresh scan (the DOM may have changed since the indicator ran). Never
 * derives an insertIndex itself.
 */
export function resolveDrop(
  geometry: ReorderGeometry,
  draggableElement: HTMLElement | null,
  insertIndex: number,
): DropResolution | false {
  const droppables = geometry.getDroppables()
  const draggableIndex = draggableElement ? droppables.indexOf(draggableElement) : -1
  if (!isReorderAllowed(draggableIndex, insertIndex)) {
    return false
  }
  return { draggableIndex, droppables }
}

/**
 * insertIndex is derived against a list that still contains the dragged
 * element; when reordering by remove-then-splice, account for the removal
 * shifting every later slot down by one.
 */
export function adjustInsertIndexForRemoval(draggableIndex: number, insertIndex: number): number {
  return draggableIndex < insertIndex ? insertIndex - 1 : insertIndex
}
