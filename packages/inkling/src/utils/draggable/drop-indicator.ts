import type { DroppablePosition } from '@kobato/inkling-internal/utils/draggable/DragDropContainer'

import {
  DROP_INDICATOR_DATA_ATTR,
  DROP_INDICATOR_ZINDEX,
} from '@kobato/inkling-internal/utils/draggable/draggable-constants'

const REPOSITION_DELAY_MS = 150
const SUBPIXEL_TOLERANCE_PX = 1

export interface DropIndicatorGeometry {
  getDroppableBox(droppable: HTMLElement): { top: number; left: number; width: number; height: number }
  getParentPosition(parent: HTMLElement): { top: number; left: number }
}

export function createDropIndicatorGeometry(): DropIndicatorGeometry {
  return {
    getDroppableBox(droppable) {
      return {
        top: droppable.offsetTop,
        left: droppable.offsetLeft,
        width: droppable.offsetWidth,
        height: droppable.offsetHeight,
      }
    },
    getParentPosition(parent) {
      const rect = parent.getBoundingClientRect()
      return { top: rect.top, left: rect.left }
    },
  }
}

export interface DropIndicatorOptions {
  editorContainerElement: HTMLElement | null
  geometry?: DropIndicatorGeometry
}

export class DropIndicator {
  element: HTMLElement | null = null
  _editorContainerElement: HTMLElement | null
  _geometry: DropIndicatorGeometry
  _repositionTimeout: ReturnType<typeof setTimeout> | null = null

  constructor({ editorContainerElement, geometry }: DropIndicatorOptions) {
    this._editorContainerElement = editorContainerElement
    this._geometry = geometry ?? createDropIndicatorGeometry()
  }

  attach() {
    if (!this.element) {
      const element = document.createElement('div')
      element.dataset[DROP_INDICATOR_DATA_ATTR] = 'true'
      element.className = 'rounded-full bg-green'
      element.style.position = 'absolute'
      element.style.opacity = '0'
      element.style.width = '4px'
      element.style.height = '0'
      element.style.zIndex = String(DROP_INDICATOR_ZINDEX)
      element.style.pointerEvents = 'none'
      this.element = element
    }

    if (!this.element.isConnected) {
      this._editorContainerElement?.appendChild(this.element)
    }
  }

  show(droppable: HTMLElement, position: DroppablePosition) {
    const element = this.element
    if (!element) {
      return
    }

    this.hide()

    const parent = element.parentElement
    if (!parent) {
      return
    }

    const parentPosition = this._geometry.getParentPosition(parent)
    const box = this._geometry.getDroppableBox(droppable)

    const lastLeft = parseInt(element.style.left, 10) || 0
    const lastTop = parseInt(element.style.top, 10) || 0

    const newWidth = box.width
    const newHeight = 4
    const newLeft = box.left - parentPosition.left
    const newTop = (position.startsWith('top') ? box.top - 2 : box.top + box.height - 2) - parentPosition.top

    if (
      newTop >= lastTop - SUBPIXEL_TOLERANCE_PX &&
      newTop <= lastTop + SUBPIXEL_TOLERANCE_PX &&
      newLeft >= lastLeft - SUBPIXEL_TOLERANCE_PX &&
      newLeft <= lastLeft + SUBPIXEL_TOLERANCE_PX
    ) {
      element.style.opacity = '1'
    } else {
      element.style.opacity = '0'

      this._repositionTimeout = setTimeout(() => {
        element.style.width = `${newWidth}px`
        element.style.height = `${newHeight}px`
        element.style.left = `${newLeft}px`
        element.style.top = `${newTop}px`
        element.style.opacity = '1'
      }, REPOSITION_DELAY_MS)
    }
  }

  hide() {
    if (this._repositionTimeout) {
      clearTimeout(this._repositionTimeout)
      this._repositionTimeout = null
    }

    if (this.element) {
      this.element.style.opacity = '0'
    }
  }

  destroy() {
    this.hide()
    this.element?.remove()
    this.element = null
  }
}
