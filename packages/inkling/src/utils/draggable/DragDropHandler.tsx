import { ActiveDrag } from '@kobato/inkling-internal/utils/draggable/ActiveDrag'
import {
  createDragStartSession,
  DRAG_START_THRESHOLD,
  type DragSessionPoint,
  type DragStartSession,
} from '@kobato/inkling-internal/utils/draggable/drag-session'
import {
  DragDropContainer,
  type ContainerDragHandlers,
  type DraggableInfo,
} from '@kobato/inkling-internal/utils/draggable/DragDropContainer'
import {
  CONTAINER_SELECTOR,
  DRAGGABLE_SELECTOR,
  DRAG_DISABLED_SELECTOR,
  DROPPABLE_SELECTOR,
  INKLING_ZINDEX,
  INKLING_CONTAINER_ID,
} from '@kobato/inkling-internal/utils/draggable/draggable-constants'
import { applyUserSelect, getParent } from '@kobato/inkling-internal/utils/draggable/draggable-utils'
import { DropIndicator } from '@kobato/inkling-internal/utils/draggable/drop-indicator'
import { resolveHoverTransition } from '@kobato/inkling-internal/utils/draggable/hover-transitions'
import { ScrollHandler, type ScrollHandlerOptions } from '@kobato/inkling-internal/utils/draggable/ScrollHandler'

export interface DraggableContainerHandle {
  enableDrag: () => void
  disableDrag: () => void
  refresh: () => void
  destroy: () => void
}

export interface DragDropHandlerOptions {
  editorContainerElement?: HTMLElement
  scrollHandlerOptions?: ScrollHandlerOptions
  onDraggingChange?: (isDragging: boolean) => void
}

export class DragDropHandler {
  editorContainerElement: HTMLElement | null = null
  containers: DragDropContainer[] = []
  grabbedElement: HTMLElement | null = null
  sourceContainer: DragDropContainer | null = null
  scrollHandler: ScrollHandler
  dropIndicator: DropIndicator

  _activeDrag: ActiveDrag | null = null
  _listenerDetach: Record<string, () => void> = {}
  _dragPreviewContainerElement: HTMLElement | null = null
  _rafUpdateDragPreviewElementPosition: () => void
  _dragStartSession: DragStartSession | null = null
  _onDraggingChange?: (isDragging: boolean) => void

  isDragging: boolean = false

  get draggableInfo(): DraggableInfo | null {
    return this._activeDrag?.draggableInfo ?? null
  }

  constructor({ editorContainerElement, scrollHandlerOptions, onDraggingChange }: DragDropHandlerOptions = {}) {
    this.editorContainerElement = editorContainerElement ?? null
    this._onDraggingChange = onDraggingChange
    this.containers = []
    this.scrollHandler = new ScrollHandler(scrollHandlerOptions)
    this.dropIndicator = new DropIndicator({ editorContainerElement: this.editorContainerElement })

    this._rafUpdateDragPreviewElementPosition = this._updateDragPreviewElementPosition.bind(this)

    this._addGrabListeners()
    this._appendDragPreviewContainerElement()
  }

  destroy() {
    this.cleanup()
    this._removeGrabListeners()
    this.dropIndicator.destroy()
    this._removeDragPreviewContainerElement()
  }

  registerContainer(element: HTMLElement, options: ContainerDragHandlers): DraggableContainerHandle {
    const container = new DragDropContainer(element, options)
    this.containers.push(container)

    return {
      enableDrag: () => {
        container.enableDrag()
      },

      disableDrag: () => {
        container.disableDrag()
      },

      refresh: () => {
        container.refresh()
      },

      destroy: () => {
        container.disableDrag()
        this.containers = this.containers.filter((c) => c !== container)
      },
    }
  }

  cleanup() {
    this.containers.forEach((container) => container.disableDrag())
    this.containers = []
    this._resetDrag()
  }

  simulateDrag(element: HTMLElement, start: DragSessionPoint = { x: 10, y: 10 }): void {
    element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: start.x, clientY: start.y, button: 0 }))
    this._dragStartSession?.move({ x: start.x + DRAG_START_THRESHOLD + 1, y: start.y })
  }

  _onMouseDown(event: MouseEvent) {
    if (!this.isDragging && event.button === 0) {
      const target = event.target instanceof Element ? event.target : null
      const grabbedElement = getParent(target, DRAGGABLE_SELECTOR)
      this.grabbedElement = grabbedElement instanceof HTMLElement ? grabbedElement : null

      if (this.grabbedElement) {
        const dragDisabledElement = getParent(target, DRAG_DISABLED_SELECTOR)
        if (dragDisabledElement && this.grabbedElement.contains(dragDisabledElement)) {
          return
        }

        const containerElement = getParent(this.grabbedElement, CONTAINER_SELECTOR)
        const container = this.containers.find((c) => c.element === containerElement)
        this.sourceContainer = container ?? null

        if (container?.isDragEnabled) {
          this._beginDragStartSession(event)
        }
      }
    }
  }

  _onMouseMove(event: MouseEvent) {
    event.preventDefault()

    if (this.draggableInfo) {
      this.draggableInfo.mousePosition.x = event.clientX
      this.draggableInfo.mousePosition.y = event.clientY

      this._handleDrag()
    }
  }

  _onMouseUp() {
    const drag = this._activeDrag
    if (drag) {
      let success = false
      let sourceHandled = false
      const dropTarget = drag.overContainer

      if (dropTarget) {
        const result = dropTarget.onDrop(drag.draggableInfo, drag.dropResolution)
        if (typeof result === 'boolean') {
          success = result
        } else {
          success = result.success
          sourceHandled = result.sourceHandled ?? false
        }
      }

      this.containers.forEach((container) => {
        container.onDropEnd(drag.draggableInfo, success, sourceHandled && container === dropTarget)
      })
    }

    this._resetDrag()
  }

  _onKeyDown(event: KeyboardEvent) {
    if (this.isDragging && event.key === 'Escape') {
      this._resetDrag()
    }
  }

  _beginDragStartSession(startEvent: MouseEvent) {
    this._dragStartSession?.cancel()
    this._dragStartSession = createDragStartSession(
      { x: startEvent.clientX, y: startEvent.clientY },
      {
        listen: ({ move, release, nativeDrag }) => {
          const onMove = (event: MouseEvent) => move({ x: event.clientX, y: event.clientY })
          document.addEventListener('mousemove', onMove, { passive: false })
          document.addEventListener('mouseup', release, { passive: false })
          document.addEventListener('drag', nativeDrag, { passive: false })
          return () => {
            document.removeEventListener('mousemove', onMove)
            document.removeEventListener('mouseup', release)
            document.removeEventListener('drag', nativeDrag)
          }
        },
        onStart: () => {
          window.getSelection()?.removeAllRanges()
          this._initiateDrag(startEvent)
        },
      },
    )
  }

  _initiateDrag(startEvent: MouseEvent) {
    this._setIsDragging(true)
    applyUserSelect(document.body, 'none')

    if (!this.sourceContainer) {
      this._resetDrag()
      return
    }

    const initialDraggableInfo = this.sourceContainer.getDraggableInfo(this.grabbedElement)

    if (!initialDraggableInfo) {
      this._resetDrag()
      return
    }

    this.dropIndicator.attach()

    const draggableInfo: DraggableInfo = {
      ...initialDraggableInfo,
      element: this.grabbedElement,
      mousePosition: {
        x: startEvent.clientX,
        y: startEvent.clientY,
      },
    }

    const activeDrag = new ActiveDrag({
      draggableInfo,
      listeners: {
        onMouseMove: (event) => this._onMouseMove(event),
        onMouseUp: () => this._onMouseUp(),
        onKeyDown: (event) => this._onKeyDown(event),
      },
    })
    this._activeDrag = activeDrag

    this.containers.forEach((container) => {
      container.onDragStart(draggableInfo)
    })

    if (draggableInfo.element) {
      draggableInfo.element.style.opacity = '0.5'
    }

    const dragPreview = this.sourceContainer.createDragPreviewElement(draggableInfo)
    if (dragPreview) {
      this._dragPreviewContainerElement?.appendChild(dragPreview.element)
      const dragPreviewElementRect = dragPreview.element.getBoundingClientRect()
      activeDrag.dragPreviewInfo = {
        element: dragPreview.element,
        dispose: dragPreview.dispose,
        positionX: dragPreviewElementRect.x,
        positionY: dragPreviewElementRect.y,
      }
    } else {
      this._resetDrag()
      return
    }

    requestAnimationFrame(this._rafUpdateDragPreviewElementPosition)

    this.scrollHandler.dragStart(draggableInfo)

    this._setHoverSuppression(true)

    this._handleDrag()
  }

  _setHoverSuppression(suppress: boolean) {
    const container = this.editorContainerElement
    const editorRoot =
      container?.closest<HTMLElement>('[data-inkling="editor"]') ??
      container?.querySelector<HTMLElement>('[data-inkling="editor"]')
    if (editorRoot) {
      if (suppress) {
        editorRoot.setAttribute('data-inkling-dragging', 'true')
      } else {
        editorRoot.removeAttribute('data-inkling-dragging')
      }
    }
  }

  _handleDrag() {
    const drag = this._activeDrag
    if (!drag || !this._dragPreviewContainerElement) {
      return
    }
    const { draggableInfo } = drag

    this._dragPreviewContainerElement.hidden = true
    const target = document.elementFromPoint(draggableInfo.mousePosition.x, draggableInfo.mousePosition.y)
    draggableInfo.target = target instanceof HTMLElement ? target : null
    this._dragPreviewContainerElement.hidden = false

    this.scrollHandler.dragMove(draggableInfo)

    const containerElem = getParent(target, CONTAINER_SELECTOR)
    const rawDroppable = getParent(target, DROPPABLE_SELECTOR)
    const droppableElem = rawDroppable instanceof HTMLElement ? rawDroppable : null

    const { state, effects } = resolveHoverTransition<DragDropContainer>(
      {
        container: drag.overContainer,
        containerElem: drag.overContainerElem,
        droppableElem: drag.overDroppableElem,
        droppablePosition: drag.overDroppablePosition,
      },
      {
        containerElem,
        container: containerElem ? (this.containers.find((c) => c.element === containerElem) ?? null) : null,
        droppableElem,
        droppableRect: droppableElem ? droppableElem.getBoundingClientRect() : null,
        mouse: draggableInfo.mousePosition,
      },
    )

    const prevContainer = drag.overContainer
    drag.overContainer = state.container
    drag.overContainerElem = state.containerElem
    drag.overDroppableElem = state.droppableElem
    drag.overDroppablePosition = state.droppablePosition

    for (const effect of effects) {
      switch (effect.kind) {
        case 'leave-container':
          prevContainer?.onDragLeaveContainer(draggableInfo)
          drag.dropResolution = null
          this.dropIndicator.hide()
          break
        case 'enter-container':
          drag.overContainer?.onDragEnterContainer(draggableInfo)
          break
        case 'leave-droppable':
          drag.overContainer?.onDragLeaveDroppable(effect.droppable)
          break
        case 'enter-droppable':
          drag.overContainer?.onDragEnterDroppable(effect.droppable, effect.position)
          break
        case 'resolve-drop': {
          if (drag.overContainer) {
            drag.overContainer.onDragOverDroppable(effect.droppable, effect.position)
          }
          const resolution = drag.overContainer?.getIndicatorPosition(draggableInfo, effect.droppable, effect.position)
          if (resolution) {
            drag.dropResolution = resolution
            this.dropIndicator.show(effect.droppable, effect.position)
          } else {
            drag.dropResolution = null
            this.dropIndicator.hide()
          }
          break
        }
      }
    }
  }

  _setIsDragging(value: boolean) {
    if (this.isDragging === value) {
      return
    }
    this.isDragging = value
    this._onDraggingChange?.(value)
  }

  _updateDragPreviewElementPosition() {
    if (this.isDragging) {
      requestAnimationFrame(this._rafUpdateDragPreviewElementPosition)
    }

    const drag = this._activeDrag
    if (drag?.dragPreviewInfo) {
      const { dragPreviewInfo, draggableInfo } = drag
      const left = dragPreviewInfo.positionX * -1 + draggableInfo.mousePosition.x
      const top = dragPreviewInfo.positionY * -1 + draggableInfo.mousePosition.y
      dragPreviewInfo.element.style.transform = `translate3d(${left}px, ${top}px, 0)`
    }
  }

  _resetDrag() {
    this._dragStartSession?.cancel()
    this._dragStartSession = null
    this.dropIndicator.hide()

    this.scrollHandler.dragStop()

    if (this.grabbedElement) {
      this.grabbedElement.style.opacity = ''
    }

    this._setIsDragging(false)
    this.grabbedElement = null
    this.sourceContainer = null

    const activeDrag = this._activeDrag
    this._activeDrag = null
    activeDrag?.dispose()

    this.containers.forEach((container) => {
      container.onDragEnd()
    })

    this._setHoverSuppression(false)

    applyUserSelect(document.body, '')
  }

  _appendDragPreviewContainerElement() {
    if (!this._dragPreviewContainerElement && this.editorContainerElement) {
      const dragPreviewContainerElement = document.createElement('div')
      dragPreviewContainerElement.id = INKLING_CONTAINER_ID
      dragPreviewContainerElement.style.position = 'fixed'
      dragPreviewContainerElement.style.width = '100%'
      dragPreviewContainerElement.style.zIndex = String(INKLING_ZINDEX)

      this.editorContainerElement.appendChild(dragPreviewContainerElement)

      this._dragPreviewContainerElement = dragPreviewContainerElement
    }
  }

  _removeDragPreviewContainerElement() {
    this._dragPreviewContainerElement?.remove()
  }

  _addGrabListeners() {
    this._addEventListener('mousedown', (event) => this._onMouseDown(event), { passive: false })
  }

  _removeGrabListeners() {
    this._removeEventListener('mousedown')
  }

  _addEventListener<K extends keyof DocumentEventMap>(
    e: K,
    method: (event: DocumentEventMap[K]) => void,
    options?: AddEventListenerOptions | boolean,
  ) {
    if (!this._listenerDetach[e]) {
      const handler = method.bind(this)
      document.addEventListener(e, handler, options)
      this._listenerDetach[e] = () => {
        document.removeEventListener(e, handler)
      }
    }
  }

  _removeEventListener(e: keyof DocumentEventMap) {
    const detach = this._listenerDetach[e]
    if (detach) {
      detach()
      delete this._listenerDetach[e]
    }
  }
}
