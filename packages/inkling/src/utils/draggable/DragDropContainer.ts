import type { ImageNodeDataset } from '@kobato/inkling-internal/nodes/cards/card-commands'
import type { ComponentType, SVGProps } from 'react'

import {
  CONTAINER_DATA_ATTR,
  DRAGGABLE_DATA_ATTR,
  DROPPABLE_DATA_ATTR,
  INKLING_ZINDEX,
} from '@kobato/inkling-internal/utils/draggable/draggable-constants'
import { isGalleryImageDrag } from '@kobato/inkling-internal/utils/draggable/gallery-drop'

export interface ContainerDraggableConfig {
  draggableSelector: string
  getDraggableInfo: (draggableElement: HTMLElement | null) => DraggableInfo | false
  createDragPreviewElement?: (draggableInfo: DraggableInfo) => DragPreview | undefined
  isDragEnabled?: boolean
}

export interface DragPreview {
  element: HTMLElement
  dispose?: () => void
}

export interface ContainerDroppableConfig {
  droppableSelector: string
  getIndicatorPosition: (
    draggableInfo: DraggableInfo,
    droppableElem: HTMLElement,
    position: DroppablePosition,
  ) => DropResolution | false
  onDrop: (draggableInfo: DraggableInfo, resolution: DropResolution | null) => DropResult
  onDragEnterContainer?: (draggableInfo: DraggableInfo) => void
  onDragEnterDroppable?: (droppable: HTMLElement, position: DroppablePosition) => void
  onDragOverDroppable?: (droppable: HTMLElement, position: DroppablePosition) => void
  onDragLeaveDroppable?: (droppable: HTMLElement) => void
  onDragLeaveContainer?: (draggableInfo: DraggableInfo) => void
}

export type DropResult = boolean | { success: boolean; sourceHandled?: boolean }

export interface ContainerLifecycleHandlers {
  onDragStart?: (draggableInfo: DraggableInfo) => void
  onDragEnd?: () => void
  onDropEnd?: (draggableInfo: DraggableInfo, success: boolean, sourceHandled: boolean) => void
}

export interface ContainerDragHandlers {
  draggable: ContainerDraggableConfig
  droppable: ContainerDroppableConfig
  lifecycle?: ContainerLifecycleHandlers
}

export interface DraggableInfoBase {
  element: HTMLElement | null
  target: HTMLElement | null
  mousePosition: { x: number; y: number }
}

export interface CardDraggableInfo extends DraggableInfoBase {
  type: 'card'
  cardName: string
  nodeKey: string
  Icon?: ComponentType<SVGProps<SVGSVGElement>>
  dataset: Record<string, unknown>
}

export interface ImageDraggableInfo extends DraggableInfoBase {
  type: 'image'
  dataset: ImageNodeDataset
}

export type DraggableInfo = CardDraggableInfo | ImageDraggableInfo

export type DroppablePosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

export interface DropResolution {
  insertIndex: number
}

const noop = (): void => undefined

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
