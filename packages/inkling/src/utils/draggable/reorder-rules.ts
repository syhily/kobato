import type { DroppablePosition } from '@kobato/inkling-internal/utils/draggable/DragDropContainer'

export type ReorderDirection = 'vertical' | 'horizontal'

export interface ReorderGeometry {
  getDroppables(): HTMLElement[]
}

export function createReorderGeometry(container: HTMLElement | null, droppableSelector: string): ReorderGeometry {
  return {
    getDroppables() {
      return container ? Array.from(container.querySelectorAll<HTMLElement>(droppableSelector)) : []
    },
  }
}

export function getInsertIndex(
  droppableIndex: number,
  position: DroppablePosition,
  direction: ReorderDirection,
): number {
  const onTrailingEdge = direction === 'vertical' ? position.startsWith('bottom') : position.endsWith('right')
  return onTrailingEdge ? droppableIndex + 1 : droppableIndex
}

export function isReorderAllowed(draggableIndex: number, insertIndex: number): boolean {
  if (draggableIndex === -1) {
    return true
  }
  return insertIndex !== draggableIndex && insertIndex !== draggableIndex + 1
}

export interface ReorderResolution {
  draggableIndex: number
  insertIndex: number
}

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
  draggableIndex: number
  droppables: HTMLElement[]
}

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

export function adjustInsertIndexForRemoval(draggableIndex: number, insertIndex: number): number {
  return draggableIndex < insertIndex ? insertIndex - 1 : insertIndex
}
