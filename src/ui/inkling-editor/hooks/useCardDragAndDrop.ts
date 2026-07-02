import React from 'react'

import type { DraggableInfo, DroppablePosition } from '@/ui/inkling-editor/utils/draggable/DragDropContainer'

import InklingComposerContext from '@/ui/inkling-editor/context/InklingComposerContext'

export interface UseCardDragAndDropOptions {
  enabled?: boolean
  canDrop: (draggableInfo: DraggableInfo) => boolean
  onDrop?: (draggableInfo: DraggableInfo) => boolean | undefined
  onDropEnd?: (draggableInfo: DraggableInfo, success: boolean) => void
  getDraggableInfo?: (draggableElement: HTMLElement | null) => DraggableInfo | Record<string, never>
  getIndicatorPosition?: (
    draggableInfo: DraggableInfo,
  ) => { insertIndex: number; element: HTMLElement } | false | undefined
  draggableSelector: string
  droppableSelector: string
}

export interface UseCardDragAndDropResult {
  setRef: React.Dispatch<React.SetStateAction<HTMLElement | null>>
  isDraggedOver: boolean
}

export default function useCardDragAndDrop({
  enabled = true,
  canDrop,
  onDrop,
  onDropEnd,
  getDraggableInfo,
  getIndicatorPosition,
  draggableSelector,
  droppableSelector,
}: UseCardDragAndDropOptions): UseCardDragAndDropResult {
  const inkling = React.useContext(InklingComposerContext)

  const [containerRef, setContainerRef] = React.useState<HTMLElement | null>(null)
  const [isDraggedOver, setIsDraggedOver] = React.useState<boolean>(false)
  const dragDropContainer = React.useRef<{
    enableDrag: () => void
    disableDrag: () => void
    destroy: () => void
  } | null>(null)

  const onDragStart = React.useCallback(
    (draggableInfo: DraggableInfo) => {
      if (canDrop(draggableInfo)) {
        dragDropContainer.current?.enableDrag()
      } else {
        dragDropContainer.current?.disableDrag()
      }
    },
    [canDrop],
  )

  const onDragEnd = React.useCallback(() => {
    setIsDraggedOver(false)
  }, [setIsDraggedOver])

  const onDragEnterContainer = React.useCallback(
    (draggableInfo: DraggableInfo) => {
      setIsDraggedOver(canDrop(draggableInfo))
    },
    [setIsDraggedOver, canDrop],
  )

  const onDragLeaveContainer = React.useCallback(() => {
    setIsDraggedOver(false)
  }, [setIsDraggedOver])

  const _onDrop = React.useCallback(
    (draggableInfo: DraggableInfo) => {
      return onDrop?.(draggableInfo) || false
    },
    [onDrop],
  )

  const _onDropEnd = React.useCallback(
    (draggableInfo: DraggableInfo, success: boolean) => {
      onDropEnd?.(draggableInfo, success)
    },
    [onDropEnd],
  )

  // returns {
  //   direction: 'horizontal' TODO: use a constant?
  //   position: 'left'/'right' TODO: use constants?
  //   beforeElems: array of elems to left of indicator
  //   afterElems: array of elems to right of indicator
  //   droppableIndex:
  // }
  const _getIndicatorPosition = React.useCallback(
    (draggableInfo: DraggableInfo) => {
      return getIndicatorPosition?.(draggableInfo) || false
    },
    [getIndicatorPosition],
  )

  const _getDraggableInfo = React.useCallback(
    (draggableElement: HTMLElement | null): DraggableInfo | false => {
      const result = getDraggableInfo?.(draggableElement)
      if (!result || Object.keys(result).length === 0) {
        return false
      }
      return result as DraggableInfo
    },
    [getDraggableInfo],
  )

  React.useEffect(() => {
    if (enabled) {
      dragDropContainer.current?.enableDrag()
    } else {
      dragDropContainer.current?.disableDrag()
    }
  }, [enabled, containerRef])

  React.useEffect(() => {
    if (!containerRef || !inkling?.dragDropHandler) {
      return
    }

    const container = inkling.dragDropHandler.registerContainer(containerRef, {
      draggableSelector,
      droppableSelector,
      isDragEnabled: enabled,
      onDragStart,
      onDragEnd,
      onDragEnterContainer,
      onDragLeaveContainer,
      onDragEnterDroppable: (_droppable: HTMLElement, _position: DroppablePosition) => {},
      onDragOverDroppable: (_droppable: HTMLElement, _position: DroppablePosition) => {},
      onDragLeaveDroppable: (_droppable: HTMLElement) => {},
      getDraggableInfo: _getDraggableInfo,
      getIndicatorPosition: _getIndicatorPosition,
      onDrop: _onDrop,
      onDropEnd: _onDropEnd,
    })
    // oxlint-disable-next-line typescript/no-explicit-any
    dragDropContainer.current = container as any
  }, [
    _getDraggableInfo,
    _getIndicatorPosition,
    _onDrop,
    _onDropEnd,
    containerRef,
    draggableSelector,
    droppableSelector,
    enabled,
    inkling?.dragDropHandler,
    onDragEnd,
    onDragEnterContainer,
    onDragLeaveContainer,
    onDragStart,
  ])

  return { setRef: setContainerRef, isDraggedOver }
}
