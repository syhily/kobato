import type {
  DragDropContainer,
  DraggableInfo,
  DragPreview,
  DroppablePosition,
  DropResolution,
} from '@/inkling/utils/draggable/DragDropContainer'

// the per-drag event handlers ActiveDrag listens to for the drag's lifetime
export interface ActiveDragListeners {
  onMouseMove: (event: MouseEvent) => void
  onMouseUp: (event: MouseEvent) => void
  onKeyDown: (event: KeyboardEvent) => void
}

interface ActiveDragOptions {
  draggableInfo: DraggableInfo
  listeners: ActiveDragListeners
}

/**
 * Everything a single in-flight drag owns, created in DragDropHandler._initiateDrag and
 * disposed in _resetDrag. Per-drag concerns are fields with disposal in dispose(); the
 * document listeners are registered on construction and removed on dispose, always paired.
 */
export class ActiveDrag {
  draggableInfo: DraggableInfo
  overContainer: DragDropContainer | null = null
  overContainerElem: Element | null = null
  overDroppableElem: HTMLElement | null = null
  overDroppablePosition: DroppablePosition | null = null
  dragPreviewInfo: (DragPreview & { positionX: number; positionY: number }) | null = null
  // The getIndicatorPosition answer current for the hovered droppable, written and cleared
  // only by DragDropHandler._handleDrag and passed to the drop target's onDrop at mouse-up.
  // Null between drags by construction: it dies with the ActiveDrag it rides on.
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
    // no listener uses capture, so options are not needed to detach
    this.detachListeners.push(() => {
      document.removeEventListener(type, handler)
    })
  }
}
