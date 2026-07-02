import EventEmitter from 'eventemitter3'

import {
  DragDropContainer,
  type DraggableInfo,
  type DroppablePosition,
} from '@/ui/inkling-editor/utils/draggable/DragDropContainer'
import {
  CONTAINER_SELECTOR,
  DRAGGABLE_SELECTOR,
  DRAG_DISABLED_SELECTOR,
  DROPPABLE_SELECTOR,
  DROP_INDICATOR_ID,
  DROP_INDICATOR_ZINDEX,
  INKLING_CONTAINER_ID,
} from '@/ui/inkling-editor/utils/draggable/draggable-constants'
import { applyUserSelect, getParent } from '@/ui/inkling-editor/utils/draggable/draggable-utils'
import { ScrollHandler } from '@/ui/inkling-editor/utils/draggable/ScrollHandler'

type DropIndicatorInfo = {
  insertIndex: number
  element: HTMLElement
}

interface EventHandlerEntry {
  handler: (e: Event) => void
  options?: AddEventListenerOptions | boolean
}

export class DragDropHandler {
  EE: EventEmitter<symbol | string, unknown[]> | null = null
  editorContainerElement: HTMLElement | null = null
  containers: DragDropContainer[] = []
  draggableInfo: DraggableInfo | null = null
  dragPreviewInfo: { element: HTMLElement; positionX: number; positionY: number } | null = null
  grabbedElement: HTMLElement | null = null
  scrollHandler: ScrollHandler | null = null
  sourceContainer: DragDropContainer | null = null

  _currentOverContainer: DragDropContainer | null = null
  _currentOverContainerElem: Element | null = null
  _currentOverDroppableElem: HTMLElement | null = null
  _currentOverDroppablePosition: DroppablePosition | null = null
  _dropIndicator: HTMLElement | null = null
  _elementsWithHoverRemoved: Map<HTMLElement, string[]> = new Map()
  _eventHandlers: Record<string, EventHandlerEntry> = {}
  _dragPreviewContainerElement: HTMLElement | null = null
  _rafUpdateDragPreviewElementPosition: (() => void) | null = null
  _transformedDroppables: HTMLElement[] = []
  _waitForDragStartPromise: Promise<void> | null = null
  _dropIndicatorTimeout: ReturnType<typeof setTimeout> | null = null

  isDragging: boolean = false
  transformedDroppables: HTMLElement[] = []

  // lifecycle ---------------------------------------------------------------

  constructor({ editorContainerElement }: { editorContainerElement?: HTMLElement } = {}) {
    this.editorContainerElement =
      (editorContainerElement as HTMLElement | null) ||
      document.querySelector('[data-inkling-editor] [data-lexical-editor]')
    this.containers = []
    this.scrollHandler = new ScrollHandler()
    this._transformedDroppables = []

    // bind any raf handler functions
    this._rafUpdateDragPreviewElementPosition = this._updateDragPreviewElementPosition.bind(this)

    // set up document event listeners
    this._addGrabListeners()

    // append body elements
    this._appendDragPreviewContainerElement()

    this.EE = new EventEmitter()
  }

  destroy() {
    // reset any on-going drag and remove any temporary listeners
    this.cleanup()

    // clean up document event listeners
    this._removeGrabListeners()

    // remove body elements
    this._removeDropIndicator()
    this._removeDragPreviewContainerElement()
  }

  // interface ---------------------------------------------------------------

  registerContainer(element: HTMLElement, options: ConstructorParameters<typeof DragDropContainer>[1]) {
    const container = new DragDropContainer(element, options)
    this.containers.push(container)

    // return a minimal interface to the container because this class
    // should be used for management rather than the container class instance
    return {
      enableDrag: () => {
        container.enableDrag()
      },

      disableDrag: () => {
        container.disableDrag()
      },

      refresh: () => {
        // re-calculate draggables/droppables
        container.refresh()
      },

      destroy: () => {
        // unregister container
        container.disableDrag()
        this.containers = this.containers.filter((c) => c !== container)
      },
    }
  }

  // remove all containers and event handlers, useful when leaving an editor route
  cleanup() {
    this.containers.forEach((container) => container.disableDrag())
    this.containers = []
    // cancel any tasks and remove intermittent event handlers
    this._resetDrag()
  }

  // event handlers ----------------------------------------------------------

  // we use a custom "drag" detection rather than native drag events because it
  // allows better tracking across multiple containers and gives more flexibility
  // for handling touch events later if required
  _onMouseDown(event: MouseEvent) {
    if (!this.isDragging && (event.button === undefined || event.button === 0)) {
      const target = event.target as Element | null
      const grabbedElement = getParent(target, DRAGGABLE_SELECTOR)
      this.grabbedElement = grabbedElement instanceof HTMLElement ? grabbedElement : null

      if (this.grabbedElement) {
        // some elements may have explicitly disabled dragging such as
        // captions where we want to allow text selection instead
        const dragDisabledElement = getParent(target, DRAG_DISABLED_SELECTOR)
        if (dragDisabledElement && this.grabbedElement.contains(dragDisabledElement)) {
          return
        }

        const containerElement = getParent(this.grabbedElement, CONTAINER_SELECTOR)
        const container = this.containers.find((c) => c.element === containerElement)
        this.sourceContainer = container ?? null

        if (container?.isDragEnabled) {
          this._waitForDragStart(event)
            .then(() => {
              // stop the drag creating a selection
              window.getSelection()?.removeAllRanges()
              // set up the drag details
              this._initiateDrag(event)
            })
            .catch((reason: { isCanceled?: boolean }) => {
              if (!reason.isCanceled) {
                throw reason
              }
            })
        }
      }
    }
  }

  _onMouseMove(event: MouseEvent) {
    event.preventDefault()

    if (this.draggableInfo) {
      this.draggableInfo.mousePosition.x = event.clientX
      this.draggableInfo.mousePosition.y = event.clientY

      this._handleDrag(event)
    }
  }

  _onMouseUp() {
    if (this.draggableInfo) {
      let success = false

      // TODO: accept object rather than positioned args? OR, should the
      // droppable data be stored on draggableInfo?
      if (this._currentOverContainer) {
        success = this._currentOverContainer.onDrop(
          this.draggableInfo,
          this._currentOverDroppableElem,
          this._currentOverDroppablePosition,
        )
      }

      this.containers.forEach((container) => {
        container.onDropEnd(this.draggableInfo!, success)
      })
    }

    // remove drag info and any drag preview element
    this._resetDrag()
  }

  // cancel drag on escape
  _onKeyDown(event: KeyboardEvent) {
    if (this.isDragging && event.key === 'Escape') {
      this._resetDrag()
    }
  }

  // private -----------------------------------------------------------------

  // called when we detect a mousedown event on a draggable element. Sets
  // up temporary event handlers for mousemove, mouseup, and drag. If
  // sufficient movement is detected before the mouse is released and we don't
  // detect a native drag event then the promise will resolve. Mouseup or drag
  // events will cancel the promise which will result in a rejection with {isCanceled: true}
  async _waitForDragStart(startEvent: MouseEvent) {
    const moveThreshold = 1

    // if we somehow already have a waiting promise, cancel it and keep the new one
    if (this._waitForDragStartPromise) {
      this.EE?.emit('drag-start-canceled')
      this._waitForDragStartPromise = null
    }

    const onMove = (event: Event) => {
      const e = event as MouseEvent
      const currentX = e.clientX
      const currentY = e.clientY

      if (
        Math.abs(startEvent.clientX - currentX) > moveThreshold ||
        Math.abs(startEvent.clientY - currentY) > moveThreshold
      ) {
        this.EE?.emit('drag-start-conditions-met')
      }
    }

    const onUp = () => {
      this.EE?.emit('drag-start-canceled')
    }

    const onHtmlDrag = () => {
      this.EE?.emit('drag-start-canceled')
    }

    const waitForDragStart = () => {
      document.addEventListener('mousemove', onMove, { passive: false })
      document.addEventListener('mouseup', onUp, { passive: false })
      document.addEventListener('drag', onHtmlDrag, { passive: false })

      return new Promise<void>((resolve, reject) => {
        const conditionsMet = () => {
          this.EE?.removeListener('drag-start-canceled', canceled)
          resolve()
        }

        const canceled = () => {
          this.EE?.removeListener('drag-start-conditions-met', conditionsMet)
          reject({ isCanceled: true })
        }

        this.EE?.once('drag-start-conditions-met', conditionsMet)
        this.EE?.once('drag-start-canceled', canceled)
      })
    }

    const promise = waitForDragStart()
    this._waitForDragStartPromise = promise.finally(() => {
      this._waitForDragStartPromise = null

      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.removeEventListener('drag', onHtmlDrag)
    })

    return this._waitForDragStartPromise
  }

  // called once drag start conditions have been met, `startEvent` is the initial mousedown event
  _initiateDrag(startEvent: MouseEvent) {
    this.isDragging = true
    applyUserSelect(document.body, 'none')

    if (!this.sourceContainer) {
      return
    }

    const initialDraggableInfo = this.sourceContainer.getDraggableInfo(this.grabbedElement)

    if (!initialDraggableInfo) {
      this._resetDrag()
      return
    }

    // append the drop indicator if it doesn't already exist - we append to
    // the editor's element rather than body so it needs to be re-appended
    // each time a drag is initiated in a new editor instance
    this._appendDropIndicator()

    const draggableInfo: DraggableInfo = {
      ...initialDraggableInfo,
      element: this.grabbedElement,
      mousePosition: {
        x: startEvent.clientX,
        y: startEvent.clientY,
      },
    }
    this.draggableInfo = draggableInfo

    this.containers.forEach((container) => {
      container.onDragStart(draggableInfo)
    })

    // style the dragged element
    if (draggableInfo.element) {
      draggableInfo.element.style.opacity = '0.5'
    }

    // create the drag preview element and cache its position to avoid costly
    // getBoundingClientRect calls in the mousemove handler
    const dragPreviewElement = this.sourceContainer.createDragPreviewElement(draggableInfo)
    if (dragPreviewElement && dragPreviewElement instanceof HTMLElement) {
      this._dragPreviewContainerElement?.appendChild(dragPreviewElement)
      const dragPreviewElementRect = dragPreviewElement.getBoundingClientRect()
      this.dragPreviewInfo = {
        element: dragPreviewElement,
        positionX: dragPreviewElementRect.x,
        positionY: dragPreviewElementRect.y,
      }
    } else {
      this._resetDrag()
      return
    }

    // add watches to follow the drag/drop
    this._addMoveListeners()
    this._addReleaseListeners()
    this._addKeyDownListeners()

    // start drag preview element following the mouse
    if (this._rafUpdateDragPreviewElementPosition) {
      requestAnimationFrame(this._rafUpdateDragPreviewElementPosition)
    }

    // let the scroll handler select the scrollable element
    this.scrollHandler?.dragStart(draggableInfo)

    // prevent the pointer showing the text caret over text content whilst dragging
    document.querySelectorAll('[data-inkling="editor"] [data-lexical-editor]').forEach((el) => {
      ;(el as HTMLElement).style.setProperty('cursor', 'default', 'important')
    })

    // prevent hover effects showing whilst dragging
    this._removeHoverClasses()

    this._handleDrag()
  }

  _removeHoverClasses() {
    this._restoreHoverClasses()

    this._elementsWithHoverRemoved = new Map()

    const elementsWithHover = document.querySelectorAll('[class*="hover:"]')

    elementsWithHover.forEach((element) => {
      const hoverClasses = Array.from(element.classList.values()).filter((cls) => cls.startsWith('hover:'))

      this._elementsWithHoverRemoved.set(element as HTMLElement, hoverClasses)

      ;(element as HTMLElement).classList.remove(...hoverClasses)
    })
  }

  _restoreHoverClasses() {
    if (!this._elementsWithHoverRemoved) {
      return
    }

    this._elementsWithHoverRemoved.forEach((hoverClasses, element) => {
      element.classList.add(...hoverClasses)
    })
    this._elementsWithHoverRemoved = new Map()
  }

  // called when mouse moves whilst a drag is in progress
  _handleDrag(_event?: MouseEvent) {
    if (!this.draggableInfo || !this._dragPreviewContainerElement) {
      return
    }

    // hide the drag preview element so that it's not picked up by elementFromPoint
    // when determining the target element under the mouse
    this._dragPreviewContainerElement.hidden = true
    const target = document.elementFromPoint(this.draggableInfo.mousePosition.x, this.draggableInfo.mousePosition.y)
    this.draggableInfo.target = target instanceof HTMLElement ? target : null
    this._dragPreviewContainerElement.hidden = false

    this.scrollHandler?.dragMove(this.draggableInfo)

    const overContainerElem = getParent(target, CONTAINER_SELECTOR)
    let overDroppableElem: Element | null = getParent(target, DROPPABLE_SELECTOR)

    // it's possible for the mouse to be over a "dead" area when dragging over
    // the position indicator, in this case we want to prevent a parent
    // container's droppable from being picked up
    if (!overContainerElem || !overContainerElem.contains(overDroppableElem)) {
      overDroppableElem = null
    }

    const currentOverDroppableElem = this._currentOverDroppableElem
    const isLeavingContainer = this._currentOverContainerElem && overContainerElem !== this._currentOverContainerElem
    const isLeavingDroppable = currentOverDroppableElem && overDroppableElem !== currentOverDroppableElem
    const isOverContainer = overContainerElem && overContainerElem !== this._currentOverContainerElem

    if (isLeavingContainer && this._currentOverContainer) {
      this._currentOverContainer.onDragLeaveContainer(this.draggableInfo)
      this._currentOverContainer = null
      this._currentOverContainerElem = null
      this._hideDropIndicator()
    }

    if (isOverContainer) {
      const container = this.containers.find((c) => c.element === overContainerElem)
      if (!this._currentOverContainer && container) {
        container.onDragEnterContainer(this.draggableInfo)
      }

      this._currentOverContainer = container ?? null
      this._currentOverContainerElem = overContainerElem
    }

    if (isLeavingDroppable && this._currentOverContainer && currentOverDroppableElem) {
      this._currentOverContainer.onDragLeaveDroppable(currentOverDroppableElem)
      this._currentOverDroppableElem = null
    }

    if (overDroppableElem instanceof HTMLElement) {
      // get position within the droppable
      const rect = overDroppableElem.getBoundingClientRect()
      const inTop = this.draggableInfo.mousePosition.y < rect.y + rect.height / 2
      const inLeft = this.draggableInfo.mousePosition.x < rect.x + rect.width / 2
      const position: DroppablePosition =
        `${inTop ? 'top' : 'bottom'}-${inLeft ? 'left' : 'right'}` as DroppablePosition

      if (!this._currentOverDroppableElem && this._currentOverContainer) {
        this._currentOverContainer.onDragEnterDroppable(overDroppableElem, position)
      }

      if (overDroppableElem !== this._currentOverDroppableElem || position !== this._currentOverDroppablePosition) {
        this._currentOverDroppableElem = overDroppableElem
        this._currentOverDroppablePosition = position
        if (this._currentOverContainer) {
          this._currentOverContainer.onDragOverDroppable(overDroppableElem, position)
        }

        // container.getIndicatorPosition returns false if the drop is not allowed
        const indicatorPosition = this._currentOverContainer?.getIndicatorPosition(
          this.draggableInfo,
          overDroppableElem,
          position,
        )
        if (indicatorPosition) {
          this.draggableInfo.insertIndex = indicatorPosition.insertIndex
          this._showDropIndicator(indicatorPosition)
        } else {
          this._hideDropIndicator()
        }
      }
    }
  }

  _updateDragPreviewElementPosition() {
    if (this.isDragging && this._rafUpdateDragPreviewElementPosition) {
      requestAnimationFrame(this._rafUpdateDragPreviewElementPosition)
    }

    const { dragPreviewInfo, draggableInfo } = this
    if (draggableInfo && dragPreviewInfo) {
      const left = dragPreviewInfo.positionX * -1 + draggableInfo.mousePosition.x
      const top = dragPreviewInfo.positionY * -1 + draggableInfo.mousePosition.y
      dragPreviewInfo.element.style.transform = `translate3d(${left}px, ${top}px, 0)`
    }
  }

  // position the drop indicator relative to the current droppable.
  // `info` is supplied by the container's getIndicatorPosition callback and
  // carries the insert index and target element; the actual visual position is
  // derived from the current droppable and its quadrant position.
  _showDropIndicator(info: DropIndicatorInfo) {
    const dropIndicator = this._dropIndicator
    if (!dropIndicator) {
      return
    }

    // reset everything except insertIndex before re-displaying indicator
    this._hideDropIndicator({ clearInsertIndex: false })

    const droppable = this._currentOverDroppableElem
    const position = this._currentOverDroppablePosition
    if (!droppable || !position) {
      return
    }

    const parent = dropIndicator.parentNode as HTMLElement | null
    if (!parent) {
      return
    }

    const parentRect = parent.getBoundingClientRect()
    const lastLeft = parseInt(dropIndicator.style.left, 10) || 0
    const lastTop = parseInt(dropIndicator.style.top, 10) || 0

    let newLeft: number
    let newTop: number
    let newWidth: number
    let newHeight: number

    if (position.startsWith('top') || position.startsWith('bottom')) {
      // vertical indicator: 4px bar above/below the droppable
      newWidth = droppable.offsetWidth
      newHeight = 4
      newLeft = droppable.offsetLeft
      newTop = position.startsWith('top') ? droppable.offsetTop - 2 : droppable.offsetTop + droppable.offsetHeight - 2
    } else {
      // horizontal indicator: 4px bar to the left/right of the droppable
      newWidth = 4
      newHeight = droppable.offsetHeight
      newTop = droppable.offsetTop
      newLeft = position.startsWith('left')
        ? droppable.offsetLeft - 2
        : droppable.offsetLeft + droppable.offsetWidth - 2
    }

    newLeft -= parentRect.left
    newTop -= parentRect.top

    // if indicator hasn't moved, keep it showing, otherwise wait for
    // the transform transitions to almost finish before re-positioning
    // and showing
    // NOTE: +- 1px is due to sub-pixel positioning of droppables
    if (newTop >= lastTop - 1 && newTop <= lastTop + 1 && newLeft >= lastLeft - 1 && newLeft <= lastLeft + 1) {
      dropIndicator.style.opacity = '1'
    } else {
      dropIndicator.style.opacity = '0'

      this._dropIndicatorTimeout = setTimeout(() => {
        dropIndicator.style.width = `${newWidth}px`
        dropIndicator.style.height = `${newHeight}px`
        dropIndicator.style.left = `${newLeft}px`
        dropIndicator.style.top = `${newTop}px`
        dropIndicator.style.opacity = '1'
      }, 150)
    }
  }

  _hideDropIndicator({ clearInsertIndex = true }: { clearInsertIndex?: boolean } = {}) {
    // make sure the indicator isn't shown due to a running timeout
    if (this._dropIndicatorTimeout) {
      clearTimeout(this._dropIndicatorTimeout)
    }

    // clear droppable insert index unless instructed not to (eg, when
    // resetting the display before re-positioning the indicator)
    if (clearInsertIndex && this.draggableInfo) {
      delete this.draggableInfo.insertIndex
    }

    // reset all transforms
    this._transformedDroppables.forEach((elem) => {
      elem.style.transform = ''
    })
    this.transformedDroppables = []

    // hide drop indicator
    if (this._dropIndicator) {
      this._dropIndicator.style.opacity = '0'
    }
  }

  _resetDrag() {
    this.EE?.emit('drag-start-canceled')
    this._hideDropIndicator()
    this._removeMoveListeners()
    this._removeReleaseListeners()

    this.scrollHandler?.dragStop()

    if (this.grabbedElement) {
      this.grabbedElement.style.opacity = ''
    }

    this.isDragging = false
    this.grabbedElement = null
    this.sourceContainer = null

    if (this.dragPreviewInfo) {
      // oxlint-disable-next-line typescript/no-explicit-any
      const reactRoot = (this.dragPreviewInfo.element as unknown as { __reactRoot?: { unmount: () => void } })
        .__reactRoot
      reactRoot?.unmount()
      this.dragPreviewInfo.element.remove()
      this.dragPreviewInfo = null
    }

    this.containers.forEach((container) => {
      container.onDragEnd()
    })

    this._restoreHoverClasses()

    applyUserSelect(document.body, '')
    document.querySelectorAll('[data-inkling="editor"] [data-lexical-editor]').forEach((el) => {
      ;(el as HTMLElement).style.cursor = ''
    })
  }

  _appendDropIndicator() {
    let dropIndicator = document.querySelector<HTMLElement>(`#${DROP_INDICATOR_ID}`)
    if (!dropIndicator) {
      dropIndicator = document.createElement('div')
      dropIndicator.id = DROP_INDICATOR_ID
      // "rounded-full bg-green" kept as classes so Tailwind picks up usage
      dropIndicator.className = 'rounded-full bg-green'
      Object.assign(dropIndicator.style, {
        position: 'absolute',
        opacity: 0,
        width: '4px',
        height: '0',
        zIndex: DROP_INDICATOR_ZINDEX,
        pointerEvents: 'none',
      })

      if (this.editorContainerElement) {
        this.editorContainerElement.appendChild(dropIndicator)
      }
    }

    this._dropIndicator = dropIndicator
  }

  _removeDropIndicator() {
    this._dropIndicator?.remove()
  }

  _appendDragPreviewContainerElement() {
    if (!this._dragPreviewContainerElement && this.editorContainerElement) {
      const dragPreviewContainerElement = document.createElement('div')
      dragPreviewContainerElement.id = INKLING_CONTAINER_ID
      dragPreviewContainerElement.style.position = 'fixed'
      dragPreviewContainerElement.style.width = '100%'
      dragPreviewContainerElement.style.zIndex = String(DROP_INDICATOR_ZINDEX + 1)

      this.editorContainerElement.appendChild(dragPreviewContainerElement)

      this._dragPreviewContainerElement = dragPreviewContainerElement
    }
  }

  _removeDragPreviewContainerElement() {
    this._dragPreviewContainerElement?.remove()
  }

  _addGrabListeners() {
    this._addEventListener('mousedown', this._onMouseDown, { passive: false })
  }

  _removeGrabListeners() {
    this._removeEventListener('mousedown')
  }

  _addMoveListeners() {
    this._addEventListener('mousemove', this._onMouseMove, { passive: false })
  }

  _removeMoveListeners() {
    this._removeEventListener('mousemove')
  }

  _addReleaseListeners() {
    this._addEventListener('mouseup', this._onMouseUp, { passive: false })
  }

  _removeReleaseListeners() {
    this._removeEventListener('mouseup')
  }

  _addKeyDownListeners() {
    this._addEventListener('keydown', this._onKeyDown)
  }

  _removeKeyDownListeners() {
    this._removeEventListener('keydown')
  }

  _addEventListener<K extends keyof DocumentEventMap>(
    e: K,
    method: (event: DocumentEventMap[K]) => void,
    options?: AddEventListenerOptions | boolean,
  ) {
    if (!this._eventHandlers[e]) {
      const handler = method.bind(this) as EventListener
      this._eventHandlers[e] = { handler, options }
      document.addEventListener(e, handler, options)
    }
  }

  _removeEventListener<K extends keyof DocumentEventMap>(e: K) {
    const entry = this._eventHandlers[e]
    if (entry) {
      document.removeEventListener(e, entry.handler)
      delete this._eventHandlers[e]
    }
  }
}
