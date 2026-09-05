import { ActiveDrag } from '@/utils/draggable/ActiveDrag'
import {
  createDragStartSession,
  DRAG_START_THRESHOLD,
  type DragSessionPoint,
  type DragStartSession,
} from '@/utils/draggable/drag-session'
import { DragDropContainer, type ContainerDragHandlers, type DraggableInfo } from '@/utils/draggable/DragDropContainer'
import {
  CONTAINER_SELECTOR,
  DRAGGABLE_SELECTOR,
  DRAG_DISABLED_SELECTOR,
  DROPPABLE_SELECTOR,
  INKLING_ZINDEX,
  INKLING_CONTAINER_ID,
} from '@/utils/draggable/draggable-constants'
import { applyUserSelect, getParent } from '@/utils/draggable/draggable-utils'
import { DropIndicator } from '@/utils/draggable/drop-indicator'
import { resolveHoverTransition } from '@/utils/draggable/hover-transitions'
import { ScrollHandler, type ScrollHandlerOptions } from '@/utils/draggable/ScrollHandler'

interface EventHandlerEntry {
  handler: (e: Event) => void
  options?: AddEventListenerOptions | boolean
}

export interface DraggableContainerHandle {
  enableDrag: () => void
  disableDrag: () => void
  refresh: () => void
  destroy: () => void
}

export interface DragDropHandlerOptions {
  editorContainerElement?: HTMLElement
  // forwarded to the ScrollHandler — e.g. to point its document scroll
  // container override at a custom selector
  scrollHandlerOptions?: ScrollHandlerOptions
  // the handler publishes its own isDragging truth — consumers (the drag-drop
  // handle) subscribe here instead of a container adapter hand-mirroring the
  // flag through the lifecycle callbacks
  onDraggingChange?: (isDragging: boolean) => void
}

export class DragDropHandler {
  editorContainerElement: HTMLElement | null = null
  containers: DragDropContainer[] = []
  // grab-phase state: set on mousedown, consumed (or discarded) when the drag
  // start threshold is met — everything the initiated drag owns lives in
  // _activeDrag instead
  grabbedElement: HTMLElement | null = null
  sourceContainer: DragDropContainer | null = null
  scrollHandler: ScrollHandler
  dropIndicator: DropIndicator

  _activeDrag: ActiveDrag | null = null
  _eventHandlers: Record<string, EventHandlerEntry> = {}
  _dragPreviewContainerElement: HTMLElement | null = null
  _rafUpdateDragPreviewElementPosition: () => void
  _dragStartSession: DragStartSession | null = null
  _onDraggingChange?: (isDragging: boolean) => void

  isDragging: boolean = false

  // the in-flight drag's info; null between drags. Kept as an accessor so the
  // handler's external interface survives the ActiveDrag collapse
  get draggableInfo(): DraggableInfo | null {
    return this._activeDrag?.draggableInfo ?? null
  }

  // lifecycle ---------------------------------------------------------------

  constructor({ editorContainerElement, scrollHandlerOptions, onDraggingChange }: DragDropHandlerOptions = {}) {
    this.editorContainerElement = editorContainerElement ?? null
    this._onDraggingChange = onDraggingChange
    this.containers = []
    this.scrollHandler = new ScrollHandler(scrollHandlerOptions)
    this.dropIndicator = new DropIndicator({ editorContainerElement: this.editorContainerElement })

    // bind any raf handler functions
    this._rafUpdateDragPreviewElementPosition = this._updateDragPreviewElementPosition.bind(this)

    // set up document event listeners
    this._addGrabListeners()

    // append body elements
    this._appendDragPreviewContainerElement()
  }

  destroy() {
    // reset any on-going drag and remove any temporary listeners
    this.cleanup()

    // clean up document event listeners
    this._removeGrabListeners()

    // remove body elements
    this.dropIndicator.destroy()
    this._removeDragPreviewContainerElement()
  }

  // interface ---------------------------------------------------------------

  registerContainer(element: HTMLElement, options: ContainerDragHandlers): DraggableContainerHandle {
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

  // test seam: runs the grab → drag-start choreography synchronously so unit
  // tests don't re-create it with real mousemove sequences and wall-clock
  // sleeps. Dispatches a real mousedown (the grab path runs end-to-end), then
  // drives the pending drag-start session past its threshold — drag
  // initiation is synchronous, so the drag has been initiated (or never
  // started: right click, drag-disabled target, drag already in progress)
  // when this returns
  simulateDrag(element: HTMLElement, start: DragSessionPoint = { x: 10, y: 10 }): void {
    element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: start.x, clientY: start.y, button: 0 }))
    this._dragStartSession?.move({ x: start.x + DRAG_START_THRESHOLD + 1, y: start.y })
  }

  // event handlers ----------------------------------------------------------

  // we use a custom "drag" detection rather than native drag events because it
  // allows better tracking across multiple containers and gives more flexibility
  // for handling touch events later if required
  _onMouseDown(event: MouseEvent) {
    if (!this.isDragging && event.button === 0) {
      const target = event.target instanceof Element ? event.target : null
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
        // the drop consumes the resolution the indicator showed; null means
        // no droppable resolution applied (container-level drop)
        const result = dropTarget.onDrop(drag.draggableInfo, drag.dropResolution)
        if (typeof result === 'boolean') {
          success = result
        } else {
          success = result.success
          sourceHandled = result.sourceHandled ?? false
        }
      }

      this.containers.forEach((container) => {
        // the sourceHandled report belongs to the drop target alone — every
        // other container must still remove its source on a successful drop
        container.onDropEnd(drag.draggableInfo, success, sourceHandled && container === dropTarget)
      })
    }

    // dispose the drag and any drag preview element
    this._resetDrag()
  }

  // cancel drag on escape
  _onKeyDown(event: KeyboardEvent) {
    if (this.isDragging && event.key === 'Escape') {
      this._resetDrag()
    }
  }

  // private -----------------------------------------------------------------

  // called when we detect a mousedown event on a draggable element: begins a
  // drag-start session whose temporary document listeners (move/release/
  // native drag) decide whether the press becomes a drag (movement past the
  // start threshold) or is discarded. The threshold policy lives in
  // @/utils/draggable/drag-session; the session's listeners and resolution
  // are the ports declared here
  _beginDragStartSession(startEvent: MouseEvent) {
    // a new grab replaces any still-pending session
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
          // stop the drag creating a selection
          window.getSelection()?.removeAllRanges()
          // set up the drag details
          this._initiateDrag(startEvent)
        },
      },
    )
  }

  // called once drag start conditions have been met, `startEvent` is the initial mousedown event
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

    // append this handler's drop indicator to the editor's element rather
    // than body — the element is per-handler, attach is idempotent
    this.dropIndicator.attach()

    const draggableInfo: DraggableInfo = {
      ...initialDraggableInfo,
      element: this.grabbedElement,
      mousePosition: {
        x: startEvent.clientX,
        y: startEvent.clientY,
      },
    }

    // one object owns everything this drag creates — its listeners included —
    // so reset is disposal rather than a field-nulling checklist
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

    // style the dragged element
    if (draggableInfo.element) {
      draggableInfo.element.style.opacity = '0.5'
    }

    // create the drag preview element and cache its position to avoid costly
    // getBoundingClientRect calls in the mousemove handler
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

    // start drag preview element following the mouse
    requestAnimationFrame(this._rafUpdateDragPreviewElementPosition)

    // let the scroll handler select the scrollable element
    this.scrollHandler.dragStart(draggableInfo)

    // prevent the pointer showing the text caret over text content whilst dragging
    this._setCursorSuppression(true)

    // prevent hover effects showing whilst dragging
    this._setHoverSuppression(true)

    this._handleDrag()
  }

  // cursor suppression is scoped to this handler's own editor container —
  // with several editors on one page a drag in one must not touch the others
  _setCursorSuppression(suppress: boolean) {
    this.editorContainerElement
      ?.querySelectorAll<HTMLElement>('[data-inkling="editor"] [data-lexical-editor]')
      .forEach((el) => {
        if (suppress) {
          el.style.setProperty('cursor', 'default', 'important')
        } else {
          el.style.cursor = ''
        }
      })
  }

  _setHoverSuppression(suppress: boolean) {
    // this handler's own editor root only: the container may sit inside the
    // [data-inkling="editor"] root or wrap it — never the first editor in
    // the document
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

  // called when mouse moves whilst a drag is in progress. The transition
  // machine (hover-transitions) decides; this adapter measures the frame,
  // applies the next state, and interprets the ordered effects — container
  // callbacks, the indicator, and the drop resolution write
  _handleDrag() {
    const drag = this._activeDrag
    if (!drag || !this._dragPreviewContainerElement) {
      return
    }
    const { draggableInfo } = drag

    // hide the drag preview element so that it's not picked up by elementFromPoint
    // when determining the target element under the mouse
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
          // container.getIndicatorPosition returns false if the drop is not
          // allowed; its answer is the drop's resolution — kept on the drag
          // state and handed to onDrop at mouse-up, so what the indicator
          // showed is exactly what the drop consumes
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

  // single writer for the handler's isDragging truth: the field and the
  // published port flip together, so subscribers can never observe a state
  // the handler itself doesn't hold
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
    // cancel a grab still waiting for its start threshold (e.g. destroyed mid-grab)
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

    // disposal owns the whole per-drag teardown: listeners and the drag
    // preview (element removal + producer dispose hook)
    const activeDrag = this._activeDrag
    this._activeDrag = null
    activeDrag?.dispose()

    this.containers.forEach((container) => {
      container.onDragEnd()
    })

    this._setHoverSuppression(false)

    applyUserSelect(document.body, '')
    this._setCursorSuppression(false)
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

  // the grab (mousedown) listener is the handler's only permanent listener;
  // the per-drag move/release/escape listeners live on ActiveDrag
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
