import type { ComponentType, SVGProps } from 'react'

import {
  CONTAINER_DATA_ATTR,
  DRAGGABLE_DATA_ATTR,
  DROPPABLE_DATA_ATTR,
  INKLING_ZINDEX,
} from '@/utils/draggable/draggable-constants'

// registerContainer options (plan 047 step 4): three honest groups replacing
// one flat bag whose index signature let `isDragEnabled` ride unnamed.
// Absent optional callbacks are filled with no-ops by the constructor, so
// DragDropHandler keeps calling container.onDragStart(...) etc. untouched.
export interface ContainerDraggableConfig {
  draggableSelector: string
  getDraggableInfo: (draggableElement: HTMLElement | null) => DraggableInfo | false
  createDragPreviewElement?: (draggableInfo: DraggableInfo) => DragPreview | undefined
  isDragEnabled?: boolean
}

// the drag preview following the pointer, with an optional typed disposal
// hook. Producers that back the preview with owned resources (e.g. the card
// drag producer renders the icon with a React root) hand teardown to the
// handler through dispose() — the handler never learns what the preview is
export interface DragPreview {
  element: HTMLElement
  dispose?: () => void
}

export interface ContainerDroppableConfig {
  droppableSelector: string
  // answers the hover question "where would this drop land, and may it?" —
  // the resolution drives the drop indicator AND travels to this container's
  // own onDrop as an argument, so the drop consumes exactly what the
  // indicator showed (false = not allowed)
  getIndicatorPosition: (
    draggableInfo: DraggableInfo,
    droppableElem: HTMLElement,
    position: DroppablePosition,
  ) => DropResolution | false
  // resolution is the getIndicatorPosition answer current at mouse-up; null
  // means no droppable resolution applied (e.g. a container-level drop with
  // no droppable hovered) — each adapter decides that case deliberately
  onDrop: (draggableInfo: DraggableInfo, resolution: DropResolution | null) => DropResult
  onDragEnterContainer?: (draggableInfo: DraggableInfo) => void
  onDragEnterDroppable?: (droppable: HTMLElement, position: DroppablePosition) => void
  onDragOverDroppable?: (droppable: HTMLElement, position: DroppablePosition) => void
  onDragLeaveDroppable?: (droppable: HTMLElement) => void
  onDragLeaveContainer?: (draggableInfo: DraggableInfo) => void
}

// what a drop did, reported by the drop target's onDrop. A bare boolean is
// shorthand for { success }. sourceHandled marks drops where the target
// already moved/consumed the source itself (a reorder within one container,
// an image added to the gallery it was dragged onto) — the DragDropHandler
// routes it back to that container's onDropEnd so the source is not removed
export type DropResult = boolean | { success: boolean; sourceHandled?: boolean }

export interface ContainerLifecycleHandlers {
  onDragStart?: (draggableInfo: DraggableInfo) => void
  onDragEnd?: () => void
  // sourceHandled is true only for the container whose own onDrop reported
  // { sourceHandled: true }; every other container receives false
  onDropEnd?: (draggableInfo: DraggableInfo, success: boolean, sourceHandled: boolean) => void
}

export interface ContainerDragHandlers {
  draggable: ContainerDraggableConfig
  droppable: ContainerDroppableConfig
  lifecycle?: ContainerLifecycleHandlers
}

export interface DraggableInfo {
  // open discriminant: inkling's producers write 'card' (DragDropReorderPlugin)
  // or 'image' (gallery reorder/merge) and every consumer compares exactly
  // those literals; any other string is a host drag type consumers ignore
  type?: 'card' | 'image' | (string & {})
  cardName?: string
  // the card node's key, set by the card drag producer (DragDropReorderPlugin)
  // and read back on drop (image→gallery merge, reorder)
  nodeKey?: string
  Icon?: ComponentType<SVGProps<SVGSVGElement>>
  element: HTMLElement | null
  target: HTMLElement | null
  mousePosition: { x: number; y: number }
  // card datasets carry more than scalars — a dragged gallery's dataset
  // contains GalleryImage[] plus the live caption LexicalEditor/EditorState
  // (generate-decorator-node.getDataset copies all internal props verbatim)
  dataset: Record<string, unknown>
}

export type DroppablePosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

// the answer to "where would this drop land" — derived exactly once per hover
// target by getIndicatorPosition (reorder-rules), ferried by the handler as
// the onDrop argument, never re-derived and never read back off shared state
export interface DropResolution {
  insertIndex: number
}

const noop = () => {}

export class DragDropContainer {
  element: HTMLElement
  draggables: HTMLElement[]
  droppables: HTMLElement[]
  isDragEnabled = true
  draggableSelector: string
  droppableSelector: string
  onDragStart: NonNullable<ContainerLifecycleHandlers['onDragStart']>
  onDragEnterContainer: NonNullable<ContainerDroppableConfig['onDragEnterContainer']>
  onDragEnterDroppable: NonNullable<ContainerDroppableConfig['onDragEnterDroppable']>
  onDragOverDroppable: NonNullable<ContainerDroppableConfig['onDragOverDroppable']>
  onDragLeaveDroppable: NonNullable<ContainerDroppableConfig['onDragLeaveDroppable']>
  onDragLeaveContainer: NonNullable<ContainerDroppableConfig['onDragLeaveContainer']>
  onDragEnd: NonNullable<ContainerLifecycleHandlers['onDragEnd']>
  onDrop: ContainerDroppableConfig['onDrop']
  onDropEnd: NonNullable<ContainerLifecycleHandlers['onDropEnd']>
  getDraggableInfo: ContainerDraggableConfig['getDraggableInfo']
  getIndicatorPosition: ContainerDroppableConfig['getIndicatorPosition']
  _createDragPreviewElement?: ContainerDraggableConfig['createDragPreviewElement']

  constructor(element: HTMLElement, options: ContainerDragHandlers) {
    const { draggable, droppable, lifecycle } = options

    if (draggable.createDragPreviewElement) {
      this._createDragPreviewElement = draggable.createDragPreviewElement
    }

    // assemble the flat members the handler calls, filling absent optional
    // callbacks with no-ops
    this.element = element
    this.draggables = []
    this.droppables = []
    this.isDragEnabled = draggable.isDragEnabled ?? true
    this.draggableSelector = draggable.draggableSelector
    this.getDraggableInfo = draggable.getDraggableInfo
    this.droppableSelector = droppable.droppableSelector
    this.getIndicatorPosition = droppable.getIndicatorPosition
    this.onDrop = droppable.onDrop
    this.onDragEnterContainer = droppable.onDragEnterContainer ?? noop
    this.onDragEnterDroppable = droppable.onDragEnterDroppable ?? noop
    this.onDragOverDroppable = droppable.onDragOverDroppable ?? noop
    this.onDragLeaveDroppable = droppable.onDragLeaveDroppable ?? noop
    this.onDragLeaveContainer = droppable.onDragLeaveContainer ?? noop
    this.onDragStart = lifecycle?.onDragStart ?? noop
    this.onDragEnd = lifecycle?.onDragEnd ?? noop
    this.onDropEnd = lifecycle?.onDropEnd ?? noop

    element.dataset[CONTAINER_DATA_ATTR] = 'true'

    this.refresh()
  }

  // override these via constructor options
  enableDrag() {
    this.isDragEnabled = true
    this.element.dataset[CONTAINER_DATA_ATTR] = 'true'
    this.refresh()
  }

  disableDrag() {
    this.isDragEnabled = false
    delete this.element.dataset[CONTAINER_DATA_ATTR]
    this.refresh()
  }

  // builds an element that is attached to the mouse pointer when dragging.
  // A producer-supplied factory wins; otherwise the fallback grabs the first
  // <img> of an image draggable and uses that
  createDragPreviewElement(draggableInfo: DraggableInfo): DragPreview | undefined {
    if (typeof this._createDragPreviewElement === 'function') {
      const preview = this._createDragPreviewElement(draggableInfo)
      if (preview) {
        return preview
      }
    }

    if (draggableInfo.type === 'image' || draggableInfo.cardName === 'image') {
      const image = draggableInfo.element?.querySelector('img')
      if (image) {
        const aspectRatio = image.width / image.height
        let width = 0
        let height = 0

        // max drag preview image size is 200px in either dimension
        if (image.width > image.height) {
          width = 200
          height = 200 / aspectRatio
        } else {
          width = 200 * aspectRatio
          height = 200
        }

        const img = document.createElement('img')
        img.width = width
        img.height = height
        img.id = 'inkling-drag-drop-preview'
        img.src = image.src
        img.style.position = 'absolute'
        img.style.top = '0'
        img.style.left = `-${width}px`
        img.style.zIndex = String(INKLING_ZINDEX)
        img.style.willChange = 'transform'
        return { element: img }
      }
    }

    return undefined
  }

  // used to add data attributes to any draggable/droppable elements. This is
  // for more efficient lookup through DOM by the drag-drop-handler service
  refresh() {
    // remove all data attributes for currently held draggable/droppable elements
    this.draggables.forEach((draggable) => {
      delete draggable.dataset[DRAGGABLE_DATA_ATTR]
    })
    this.droppables.forEach((droppable) => {
      delete droppable.dataset[DROPPABLE_DATA_ATTR]
    })

    // re-populate draggable/droppable arrays
    this.draggables = []
    this.droppables = []
    if (this.isDragEnabled) {
      this.element.querySelectorAll(this.draggableSelector).forEach((draggable) => {
        if (draggable instanceof HTMLElement) {
          draggable.dataset[DRAGGABLE_DATA_ATTR] = 'true'
          this.draggables.push(draggable)
        }
      })
      this.element.querySelectorAll(this.droppableSelector).forEach((droppable) => {
        if (droppable instanceof HTMLElement) {
          droppable.dataset[DROPPABLE_DATA_ATTR] = 'true'
          this.droppables.push(droppable)
        }
      })
    }
  }
}
