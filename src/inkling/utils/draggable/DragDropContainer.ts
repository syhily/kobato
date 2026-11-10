import type { ComponentType, SVGProps } from 'react'

import type { ImageNodeDataset } from '@/inkling/nodes/cards/card-commands'

import {
  CONTAINER_DATA_ATTR,
  DRAGGABLE_DATA_ATTR,
  DROPPABLE_DATA_ATTR,
  INKLING_ZINDEX,
} from '@/inkling/utils/draggable/draggable-constants'
import { isGalleryImageDrag } from '@/inkling/utils/draggable/gallery-drop'

// Registration options for a container's draggable side. Absent optional callbacks are
// filled with no-ops by the constructor, so DragDropHandler can call them unconditionally.
export interface ContainerDraggableConfig {
  draggableSelector: string
  getDraggableInfo: (draggableElement: HTMLElement | null) => DraggableInfo | false
  createDragPreviewElement?: (draggableInfo: DraggableInfo) => DragPreview | undefined
  isDragEnabled?: boolean
}

// The drag preview following the pointer. Producers backing it with owned resources (the
// card drag producer's React root) hand teardown to the handler through dispose(), so the
// handler never learns what the preview is.
export interface DragPreview {
  element: HTMLElement
  dispose?: () => void
}

export interface ContainerDroppableConfig {
  droppableSelector: string
  // Answers "where would this drop land, and may it?" — the resolution drives the drop
  // indicator AND travels to this container's own onDrop, so the drop consumes exactly
  // what the indicator showed (false = not allowed).
  getIndicatorPosition: (
    draggableInfo: DraggableInfo,
    droppableElem: HTMLElement,
    position: DroppablePosition,
  ) => DropResolution | false
  // resolution is the getIndicatorPosition answer current at mouse-up; null means no
  // droppable resolution applied (e.g. a container-level drop with no droppable hovered) —
  // each adapter decides that case deliberately
  onDrop: (draggableInfo: DraggableInfo, resolution: DropResolution | null) => DropResult
  onDragEnterContainer?: (draggableInfo: DraggableInfo) => void
  onDragEnterDroppable?: (droppable: HTMLElement, position: DroppablePosition) => void
  onDragOverDroppable?: (droppable: HTMLElement, position: DroppablePosition) => void
  onDragLeaveDroppable?: (droppable: HTMLElement) => void
  onDragLeaveContainer?: (draggableInfo: DraggableInfo) => void
}

// What a drop did, reported by the drop target's onDrop. A bare boolean is shorthand for
// { success }. sourceHandled marks drops where the target already moved or consumed the
// source itself (a reorder within one container, an image added to the gallery it was
// dragged onto) — the handler routes such drops back to that container's onDropEnd so the
// source is not removed.
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

/** What every drag payload owns, independent of what is being dragged. */
export interface DraggableInfoBase {
  element: HTMLElement | null
  target: HTMLElement | null
  mousePosition: { x: number; y: number }
}

/**
 * A card drag, produced by DragDropReorderPlugin's top-level block scan. `dataset` is the
 * dragged card's own `getDataset()` — heterogeneous across card types, so it stays an open
 * record on purpose. The node key identifies the source card for reorder and image→gallery
 * merge.
 */
export interface CardDraggableInfo extends DraggableInfoBase {
  type: 'card'
  cardName: string
  nodeKey: string
  Icon?: ComponentType<SVGProps<SVGSVGElement>>
  dataset: Record<string, unknown>
}

/**
 * A loose image drag, produced by useGalleryReorder. Its dataset is the gallery row picked
 * into the image card's construction vocabulary (a type-only import, erased at runtime), so
 * image-insert surgery consumes it without an assertion.
 */
export interface ImageDraggableInfo extends DraggableInfoBase {
  type: 'image'
  dataset: ImageNodeDataset
}

/**
 * The closed payload set: `getDraggableInfo` is implemented exactly twice
 * (DragDropReorderPlugin's card producer and useGalleryReorder) and no host or custom drag
 * adapter exists, so this union needs no open-string escape; the pure drop policies stay
 * open.
 */
export type DraggableInfo = CardDraggableInfo | ImageDraggableInfo

export type DroppablePosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

// Derived exactly once per hover target by getIndicatorPosition, ferried by the handler as
// the onDrop argument — never re-derived, never read back off shared state.
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

  // Builds the element attached to the mouse pointer while dragging; a producer-supplied
  // factory wins, otherwise the fallback grabs the first <img> of an image draggable.
  createDragPreviewElement(draggableInfo: DraggableInfo): DragPreview | undefined {
    if (typeof this._createDragPreviewElement === 'function') {
      const preview = this._createDragPreviewElement(draggableInfo)
      if (preview) {
        return preview
      }
    }

    if (isGalleryImageDrag(draggableInfo)) {
      const image = draggableInfo.element?.querySelector('img')
      if (image) {
        const aspectRatio = image.width / image.height
        let width = 0
        let height = 0

        // preview capped at 200px in either dimension
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

  // Tags draggable/droppable elements with data attributes for efficient lookup by the
  // drag-drop handler service.
  refresh() {
    this.draggables.forEach((draggable) => {
      delete draggable.dataset[DRAGGABLE_DATA_ATTR]
    })
    this.droppables.forEach((droppable) => {
      delete droppable.dataset[DROPPABLE_DATA_ATTR]
    })

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
