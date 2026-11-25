import type {
  DraggableInfo,
  DroppablePosition,
  DropResolution,
  DropResult,
} from '@kobato/inkling-internal/utils/draggable/DragDropContainer'
import type { DraggableContainerHandle } from '@kobato/inkling-internal/utils/draggable/DragDropHandler'

import { useDragDropContainer } from '@kobato/inkling-internal/utils/draggable/use-drag-drop-container'
import { type Dispatch, type SetStateAction, useState } from 'react'
export interface UseDropTargetOptions {
  enabled?: boolean

  isDragEnabled?: boolean
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

  canDrop: (draggableInfo: DraggableInfo) => boolean

  adjustEnableOnDragStart?: (draggableInfo: DraggableInfo) => boolean | undefined
}

export interface UseDropTargetResult {
  setRef: Dispatch<SetStateAction<HTMLElement | null>>
  containerElement: HTMLElement | null
  isDraggedOver: boolean

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
  const [containerRef, setContainerRef] = useState<HTMLElement | null>(null)
  const [isDraggedOver, setIsDraggedOver] = useState<boolean>(false)

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
