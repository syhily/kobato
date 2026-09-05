import React from 'react'

import type { DraggableInfo, DroppablePosition, DropResolution, DropResult } from '@/utils/draggable/DragDropContainer'
import type { DraggableContainerHandle } from '@/utils/draggable/DragDropHandler'

import { useDragDropContainer } from '@/utils/draggable/useDragDropContainer'

// Drop target — the one owner of the drop-target hover seam: the container
// element state, the isDraggedOver hover flag (lit by the hover policy,
// cleared on leave and on drag end), and the drag-start enablement policy.
// Previously this choreography existed twice: as the one-consumer
// useCardDragAndDrop hook and inlined in useGalleryReorder. Both are now
// adapters over this module (the gallery keeps its own predicates — its hover
// policy accepts every drag, its enablement policy only enables, matching the
// historical asymmetry).

export interface UseDropTargetOptions {
  /** Master toggle, flows through the container's enable/disable pair. */
  enabled?: boolean
  /** Initial drag enablement of the registered container. */
  isDragEnabled?: boolean
  /** Re-register (re-scan the DOM) when this value changes. */
  reRegisterKey?: unknown
  draggableSelector: string
  droppableSelector: string
  getDraggableInfo?: (draggableElement: HTMLElement | null) => DraggableInfo | false | undefined
  getIndicatorPosition?: (
    draggableInfo: DraggableInfo,
    droppableElem: HTMLElement,
    position: DroppablePosition,
  ) => DropResolution | false
  onDrop?: (draggableInfo: DraggableInfo, resolution: DropResolution | null) => DropResult | false | undefined
  onDropEnd?: (draggableInfo: DraggableInfo, success: boolean, sourceHandled: boolean) => void
  /** Hover policy: whether an entering drag lights the target up. */
  canDrop: (draggableInfo: DraggableInfo) => boolean
  /**
   * Drag-start enablement policy: true enables, false disables, undefined
   * leaves the container's enablement untouched. Defaults to the hover
   * policy (enable when droppable, disable otherwise).
   */
  adjustEnableOnDragStart?: (draggableInfo: DraggableInfo) => boolean | undefined
}

export interface UseDropTargetResult {
  setRef: React.Dispatch<React.SetStateAction<HTMLElement | null>>
  /** The registered container element (null until setRef) — for adapters that scan it for geometry. */
  containerElement: HTMLElement | null
  isDraggedOver: boolean
  /** The registered container handle (no-op before registration) — for adapters that refresh after a mutation. */
  container: DraggableContainerHandle
}

export default function useDropTarget({
  enabled = true,
  isDragEnabled,
  reRegisterKey,
  draggableSelector,
  droppableSelector,
  getDraggableInfo,
  getIndicatorPosition,
  onDrop,
  onDropEnd,
  canDrop,
  adjustEnableOnDragStart,
}: UseDropTargetOptions): UseDropTargetResult {
  const [containerRef, setContainerRef] = React.useState<HTMLElement | null>(null)
  const [isDraggedOver, setIsDraggedOver] = React.useState<boolean>(false)

  const enableOnDragStart = adjustEnableOnDragStart ?? ((info: DraggableInfo) => canDrop(info))

  const container = useDragDropContainer({
    element: containerRef,
    enabled,
    reRegisterKey,
    draggable: {
      draggableSelector,
      isDragEnabled: isDragEnabled ?? enabled,
      getDraggableInfo: (draggableElement) => getDraggableInfo?.(draggableElement) ?? false,
    },
    droppable: {
      droppableSelector,
      getIndicatorPosition: (draggableInfo, droppableElem, position) =>
        getIndicatorPosition?.(draggableInfo, droppableElem, position) ?? false,
      onDrop: (draggableInfo, resolution) => onDrop?.(draggableInfo, resolution) ?? false,
      onDragEnterContainer: (draggableInfo) => {
        setIsDraggedOver(canDrop(draggableInfo))
      },
      onDragLeaveContainer: () => {
        setIsDraggedOver(false)
      },
    },
    lifecycle: {
      onDragStart: (draggableInfo) => {
        const enable = enableOnDragStart(draggableInfo)
        if (enable === true) {
          container.enableDrag()
        } else if (enable === false) {
          container.disableDrag()
        }
      },
      onDragEnd: () => {
        setIsDraggedOver(false)
      },
      onDropEnd: (draggableInfo, success, sourceHandled) => {
        onDropEnd?.(draggableInfo, success, sourceHandled)
      },
    },
  })

  return { setRef: setContainerRef, containerElement: containerRef, isDraggedOver, container }
}
