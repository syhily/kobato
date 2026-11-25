import type { ContainerDragHandlers } from '@kobato/inkling-internal/utils/draggable/DragDropContainer'
import type { DraggableContainerHandle } from '@kobato/inkling-internal/utils/draggable/DragDropHandler'

import { useDragDropHandleState } from '@kobato/inkling-internal/context/DragDropHandleContext'
import { useEffect, useRef, useState } from 'react'
export interface UseDragDropContainerOptions extends ContainerDragHandlers {
  element: HTMLElement | null
  enabled?: boolean
  reRegisterKey?: unknown
}

export function useDragDropContainer({
  element,
  enabled = true,
  reRegisterKey,
  draggable,
  droppable,
  lifecycle,
}: UseDragDropContainerOptions): DraggableContainerHandle {
  const handler = useDragDropHandleState((state) => state.handler)

  const callbacksRef = useRef({ draggable, droppable, lifecycle })
  useEffect(() => {
    callbacksRef.current = { draggable, droppable, lifecycle }
  })

  const containerRef = useRef<DraggableContainerHandle | null>(null)
  const [container] = useState<DraggableContainerHandle>(() => ({
    enableDrag: () => containerRef.current?.enableDrag(),
    disableDrag: () => containerRef.current?.disableDrag(),
    refresh: () => containerRef.current?.refresh(),
    destroy: () => containerRef.current?.destroy(),
  }))

  useEffect(() => {
    if (enabled) {
      container.enableDrag()
    } else {
      container.disableDrag()
    }
  }, [enabled, container])

  useEffect(() => {
    if (!element || !handler) {
      return
    }

    const current = () => callbacksRef.current
    const registered = handler.registerContainer(element, {
      draggable: {
        draggableSelector: draggable.draggableSelector,
        isDragEnabled: current().draggable.isDragEnabled,
        getDraggableInfo: (draggableElement) => current().draggable.getDraggableInfo(draggableElement),
        createDragPreviewElement: (draggableInfo) => current().draggable.createDragPreviewElement?.(draggableInfo),
      },
      droppable: {
        droppableSelector: droppable.droppableSelector,
        getIndicatorPosition: (draggableInfo, droppableElem, position) =>
          current().droppable.getIndicatorPosition(draggableInfo, droppableElem, position),
        onDrop: (draggableInfo, resolution) => current().droppable.onDrop(draggableInfo, resolution),
        onDragEnterContainer: (draggableInfo) => current().droppable.onDragEnterContainer?.(draggableInfo),
        onDragEnterDroppable: (droppableElem, position) =>
          current().droppable.onDragEnterDroppable?.(droppableElem, position),
        onDragOverDroppable: (droppableElem, position) =>
          current().droppable.onDragOverDroppable?.(droppableElem, position),
        onDragLeaveDroppable: (droppableElem) => current().droppable.onDragLeaveDroppable?.(droppableElem),
        onDragLeaveContainer: (draggableInfo) => current().droppable.onDragLeaveContainer?.(draggableInfo),
      },
      lifecycle: {
        onDragStart: (draggableInfo) => current().lifecycle?.onDragStart?.(draggableInfo),
        onDragEnd: () => current().lifecycle?.onDragEnd?.(),
        onDropEnd: (draggableInfo, success, sourceHandled) =>
          current().lifecycle?.onDropEnd?.(draggableInfo, success, sourceHandled),
      },
    })
    containerRef.current = registered

    return () => {
      registered.destroy()
      containerRef.current = null
    }
    // oxlint-disable-next-line react/exhaustive-effect-dependencies
  }, [element, handler, draggable.draggableSelector, droppable.droppableSelector, reRegisterKey])

  return container
}
