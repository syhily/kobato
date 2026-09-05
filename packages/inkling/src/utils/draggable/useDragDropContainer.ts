import React from 'react'

import type { ContainerDragHandlers } from '@/utils/draggable/DragDropContainer'
import type { DraggableContainerHandle } from '@/utils/draggable/DragDropHandler'

import { useDragDropHandleState } from '@/context/DragDropHandleContext'

export interface UseDragDropContainerOptions extends ContainerDragHandlers {
  // the element registered as the drag-drop container. Registration waits for
  // both the element and the DragDropHandler (published to the drag-drop
  // handle by DragDropReorderPlugin) to exist
  element: HTMLElement | null
  // enable/disable toggles after registration flow through the enable/disable
  // pair on the live container — never a re-registration. The container's
  // initial enabled state comes from draggable.isDragEnabled (default true)
  enabled?: boolean
  // re-register when this value changes. Callbacks are ref-forwarded, so a
  // re-registration is only needed to re-scan the DOM (DragDropContainer
  // refreshes its draggable/droppable markers on construction) — e.g. the
  // gallery passes its images array
  reRegisterKey?: unknown
}

// The one drag-drop registration adapter (plan 047 follow-up): owns the
// registerContainer effect against the drag-drop handle's handler, the
// enable/disable effect pair, and callback stability. Callers pass plain
// closures — they are ref-forwarded, so fresh render closures always reach
// the registered container without re-registering. Returns a stable handle
// whose methods forward to the live registration (a no-op before
// registration), replacing per-call-site `.current?.` bookkeeping.
export function useDragDropContainer({
  element,
  enabled = true,
  reRegisterKey,
  draggable,
  droppable,
  lifecycle,
}: UseDragDropContainerOptions): DraggableContainerHandle {
  const handler = useDragDropHandleState((state) => state.handler)

  const callbacksRef = React.useRef({ draggable, droppable, lifecycle })
  React.useEffect(() => {
    callbacksRef.current = { draggable, droppable, lifecycle }
  })

  const containerRef = React.useRef<DraggableContainerHandle | null>(null)
  const [container] = React.useState<DraggableContainerHandle>(() => ({
    enableDrag: () => containerRef.current?.enableDrag(),
    disableDrag: () => containerRef.current?.disableDrag(),
    refresh: () => containerRef.current?.refresh(),
    destroy: () => containerRef.current?.destroy(),
  }))

  // enable/disable toggles flow through the pair on the live container. This
  // effect is declared before the registration effect on purpose: on the
  // render where registration happens the proxy is still empty, so the
  // container's initial enabled state is the registered
  // draggable.isDragEnabled — toggles only apply once `enabled` changes
  React.useEffect(() => {
    if (enabled) {
      container.enableDrag()
    } else {
      container.disableDrag()
    }
  }, [enabled, element, container])

  React.useEffect(() => {
    if (!element || !handler) {
      return
    }

    // stable wrappers read the latest callbacks through the ref, so the
    // registered container never holds stale render closures and callback
    // identity never forces a re-registration
    const current = () => callbacksRef.current
    const registered = handler.registerContainer(element, {
      draggable: {
        draggableSelector: current().draggable.draggableSelector,
        isDragEnabled: current().draggable.isDragEnabled,
        getDraggableInfo: (draggableElement) => current().draggable.getDraggableInfo(draggableElement),
        createDragPreviewElement: (draggableInfo) => current().draggable.createDragPreviewElement?.(draggableInfo),
      },
      droppable: {
        droppableSelector: current().droppable.droppableSelector,
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

    // unregister on handler swap/unmount; calling destroy() after the handler
    // itself was destroyed is harmless (DragDropHandler disables and filters)
    return () => {
      registered.destroy()
      containerRef.current = null
    }
  }, [element, handler, draggable.draggableSelector, droppable.droppableSelector, reRegisterKey])

  return container
}
