import {
  CONTAINER_DATA_ATTR,
  DRAGGABLE_DATA_ATTR,
  DROPPABLE_DATA_ATTR,
  INKLING_ZINDEX,
} from '@/ui/inkling-editor/utils/draggable/draggable-constants'

export interface ContainerDragHandlers {
  onDragStart: (draggableInfo: DraggableInfo) => void
  onDragEnterContainer: (draggableInfo: DraggableInfo) => void
  onDragEnterDroppable: (droppable: HTMLElement, position: DroppablePosition) => void
  onDragOverDroppable: (droppable: HTMLElement, position: DroppablePosition) => void
  onDragLeaveDroppable: (droppable: HTMLElement) => void
  onDragLeaveContainer: (draggableInfo: DraggableInfo) => void
  onDragEnd: () => void
  onDrop: (draggableInfo: DraggableInfo, droppable: HTMLElement | null, position: DroppablePosition | null) => boolean
  onDropEnd: (draggableInfo: DraggableInfo, success: boolean) => void
  getDraggableInfo: (draggableElement: HTMLElement | null) => DraggableInfo | false
  getIndicatorPosition: (
    draggableInfo: DraggableInfo,
    droppableElem: HTMLElement | null,
    position: DroppablePosition,
  ) => { insertIndex: number; element: HTMLElement } | false
  draggableSelector: string
  droppableSelector: string
  createDragPreviewElement?: (draggableInfo: DraggableInfo) => HTMLElement | undefined
  [key: string]: unknown
}

export interface DraggableInfo {
  type?: string
  cardName?: string
  element: HTMLElement | null
  target: HTMLElement | null
  source: HTMLElement | null
  mousePosition: { x: number; y: number }
  insertIndex?: number
  dataset: Record<string, string | number | undefined>
  [key: string]: unknown
}

export type DroppablePosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

export class DragDropContainer {
  element!: HTMLElement
  draggables!: HTMLElement[]
  droppables!: HTMLElement[]
  isDragEnabled = true
  draggableSelector!: string
  droppableSelector!: string
  onDragStart!: ContainerDragHandlers['onDragStart']
  onDragEnterContainer!: ContainerDragHandlers['onDragEnterContainer']
  onDragEnterDroppable!: ContainerDragHandlers['onDragEnterDroppable']
  onDragOverDroppable!: ContainerDragHandlers['onDragOverDroppable']
  onDragLeaveDroppable!: ContainerDragHandlers['onDragLeaveDroppable']
  onDragLeaveContainer!: ContainerDragHandlers['onDragLeaveContainer']
  onDragEnd!: ContainerDragHandlers['onDragEnd']
  onDrop!: ContainerDragHandlers['onDrop']
  onDropEnd!: ContainerDragHandlers['onDropEnd']
  getDraggableInfo!: ContainerDragHandlers['getDraggableInfo']
  getIndicatorPosition!: ContainerDragHandlers['getIndicatorPosition']
  _createDragPreviewElement?: ContainerDragHandlers['createDragPreviewElement']

  constructor(element: HTMLElement, options: ContainerDragHandlers) {
    if (options.createDragPreviewElement) {
      this._createDragPreviewElement = options.createDragPreviewElement
    }

    // don't overwrite the createDragPreviewElement method with the consumer
    // callback — store the callback in _createDragPreviewElement instead.
    const { createDragPreviewElement: _, ...containerOptions } = options

    Object.assign(
      this,
      {
        element,
        draggables: [],
        droppables: [],
        isDragEnabled: true,
      },
      containerOptions,
    )

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

  // TODO: allow configuration for drag preview element creation
  // builds an element that is attached to the mouse pointer when dragging.
  // currently grabs the first <img> and uses that but should be configurable:
  // - a selector for which element in the draggable to copy
  // - a function to hand off element creation to the consumer
  createDragPreviewElement(draggableInfo: DraggableInfo): HTMLElement | undefined {
    let dragPreviewElement: HTMLElement | undefined

    if (typeof this._createDragPreviewElement === 'function') {
      dragPreviewElement = this._createDragPreviewElement(draggableInfo)
    }

    if (!dragPreviewElement && (draggableInfo.type === 'image' || draggableInfo.cardName === 'image')) {
      const image = draggableInfo.element?.querySelector('img') as HTMLImageElement | null
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
        dragPreviewElement = img
      }
    }

    if (dragPreviewElement) {
      return dragPreviewElement
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
