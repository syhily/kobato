import type { DroppablePosition } from '@/inkling/utils/draggable/DragDropContainer'

import { DROP_INDICATOR_DATA_ATTR, DROP_INDICATOR_ZINDEX } from '@/inkling/utils/draggable/draggable-constants'

// The drop indicator: the green line marking where a dragged element would land; offset
// math sits behind the DropIndicatorGeometry seam.

// lets the transform transition (almost) finish before re-positioning and re-showing
const REPOSITION_DELAY_MS = 150
// +-1px no-move tolerance: droppables sit on sub-pixel positions
const SUBPIXEL_TOLERANCE_PX = 1

/**
 * Geometry seam for the indicator: the offset reads the position math needs. The default
 * implementation performs the live DOM reads; tests inject fakes.
 */
export interface DropIndicatorGeometry {
  /** Offset box of the droppable the indicator aligns to (offsetTop/offsetLeft/offsetWidth/offsetHeight). */
  getDroppableBox(droppable: HTMLElement): { top: number; left: number; width: number; height: number }
  /** Viewport position of the indicator's parent element, subtracted from droppable offsets. */
  getParentPosition(parent: HTMLElement): { top: number; left: number }
}

/** Default DropIndicatorGeometry: live offset/getBoundingClientRect reads. */
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

  // Owned by this DropIndicator — created here, never adopted by global id — so two editors
  // on one page each show their own. Appended to the editor's element rather than body so
  // it survives a rebuilt container subtree.
  attach() {
    if (!this.element) {
      const element = document.createElement('div')
      element.dataset[DROP_INDICATOR_DATA_ATTR] = 'true'
      // classes (not inline styles) so Tailwind sees the usage
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

  // Just above the droppable's top edge for top-* positions, just below its bottom edge for
  // bottom-* positions.
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

    // An unmoved indicator keeps showing; a moved one waits out the transition before
    // re-positioning and showing.
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

  // Purely visual: drop resolution state is owned and cleared by the handler's drag state,
  // never by this module.
  hide() {
    // a pending re-position would re-show the indicator
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
