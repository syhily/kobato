import type {
  DragDropContainer,
  DraggableInfo,
  DragPreview,
  DroppablePosition,
  DropResolution,
} from '@kobato/inkling-internal/utils/draggable/DragDropContainer'

export interface ActiveDragListeners {
  onMouseMove: (event: MouseEvent) => void
  onMouseUp: (event: MouseEvent) => void
  onKeyDown: (event: KeyboardEvent) => void
}

interface ActiveDragOptions {
  draggableInfo: DraggableInfo
  listeners: ActiveDragListeners
}

export class ActiveDrag {
  draggableInfo: DraggableInfo
  overContainer: DragDropContainer | null = null
  overContainerElem: Element | null = null
  overDroppableElem: HTMLElement | null = null
  overDroppablePosition: DroppablePosition | null = null
  dragPreviewInfo: (DragPreview & { positionX: number; positionY: number }) | null = null
  dropResolution: DropResolution | null = null

  private detachListeners: (() => void)[] = []

  constructor({ draggableInfo, listeners }: ActiveDragOptions) {
    this.draggableInfo = draggableInfo

    this.addListener('mousemove', listeners.onMouseMove, { passive: false })
    this.addListener('mouseup', listeners.onMouseUp, { passive: false })
    this.addListener('keydown', listeners.onKeyDown)
  }

  dispose() {
    for (const detach of this.detachListeners) {
      detach()
    }
    this.detachListeners = []

    if (this.dragPreviewInfo) {
      this.dragPreviewInfo.dispose?.()
      this.dragPreviewInfo.element.remove()
      this.dragPreviewInfo = null
    }
  }

  private addListener<K extends keyof DocumentEventMap>(
    type: K,
    handler: (event: DocumentEventMap[K]) => void,
    options?: AddEventListenerOptions,
  ) {
    document.addEventListener(type, handler, options)
    this.detachListeners.push(() => {
      document.removeEventListener(type, handler)
    })
  }
}
