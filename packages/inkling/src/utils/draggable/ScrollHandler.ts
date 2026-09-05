// adapted from draggable.js Scrollable plugin (MIT)
// https://github.com/Shopify/draggable/blob/master/src/Draggable/Plugins/Scrollable/Scrollable.js
import type { DraggableInfo } from '@/utils/draggable/DragDropContainer'

import { getDocumentScrollingElement, getParentScrollableElement } from '@/utils/draggable/draggable-utils'

const defaultOptions = {
  speed: 8,
  sensitivity: 50,
}

export interface ScrollHandlerOptions {
  // selector for the element that actually scrolls when the only scrollable
  // ancestor is the document scrolling element — supplied by the host (the
  // composer's dragScrollContainerSelector option); absent, the document
  // scrolling element is used as found
  documentScrollContainerSelector?: string | null
}

interface MousePosition {
  clientX: number
  clientY: number
}

export class ScrollHandler {
  currentMousePosition: MousePosition | null = null
  findScrollableElementFrame: number | null = null
  scrollableElement: HTMLElement | null = null
  scrollAnimationFrame: number | null = null
  _isSafari: boolean
  _documentScrollContainerSelector: string | null

  constructor(options?: ScrollHandlerOptions) {
    this._documentScrollContainerSelector = options?.documentScrollContainerSelector ?? null

    this._isSafari = navigator.userAgent.includes('Safari') && !navigator.userAgent.includes('Chrome')

    // bind `this` so methods can be passed to requestAnimationFrame
    this._scroll = this._scroll.bind(this)
  }

  dragStart(draggableInfo: DraggableInfo) {
    this.findScrollableElementFrame = requestAnimationFrame(() => {
      if (draggableInfo.element) {
        this.scrollableElement = this.getScrollableElement(draggableInfo.element)
      }
    })
  }

  dragMove(draggableInfo: DraggableInfo) {
    this.findScrollableElementFrame = requestAnimationFrame(() => {
      if (draggableInfo.target) {
        this.scrollableElement = this.getScrollableElement(draggableInfo.target)
      }
    })

    if (!this.scrollableElement) {
      return
    }

    this.currentMousePosition = {
      clientX: draggableInfo.mousePosition.x,
      clientY: draggableInfo.mousePosition.y,
    }

    this.scrollAnimationFrame = requestAnimationFrame(() => this._scroll())
  }

  dragStop() {
    if (this.scrollAnimationFrame) {
      cancelAnimationFrame(this.scrollAnimationFrame)
    }
    if (this.findScrollableElementFrame) {
      cancelAnimationFrame(this.findScrollableElementFrame)
    }

    this.currentMousePosition = null
    this.findScrollableElementFrame = null
    this.scrollableElement = null
    this.scrollAnimationFrame = null
  }

  getScrollableElement(target: HTMLElement): HTMLElement {
    const found = getParentScrollableElement(target)

    // workaround for layouts that scroll inside a container rather than the
    // document: when the document scrolling element is the only scrollable
    // ancestor, prefer the configured container (see ScrollHandlerOptions)
    if (found === getDocumentScrollingElement()) {
      const container = this._documentScrollContainerSelector
        ? document.querySelector<HTMLElement>(this._documentScrollContainerSelector)
        : null
      return container ?? found
    }

    return found
  }

  _scroll() {
    if (!this.scrollableElement || !this.currentMousePosition) {
      return
    }

    if (this.scrollAnimationFrame) {
      cancelAnimationFrame(this.scrollAnimationFrame)
    }

    const { speed, sensitivity } = defaultOptions

    const rect = this.scrollableElement.getBoundingClientRect()

    const scrollableElement = this.scrollableElement
    const clientX = this.currentMousePosition.clientX
    const clientY = this.currentMousePosition.clientY

    const { offsetHeight, offsetWidth } = scrollableElement

    const topPosition = rect.top + offsetHeight - clientY
    const bottomPosition = clientY - rect.top

    // Safari will automatically scroll when the mouse is outside of the window
    // so we want to avoid our own scrolling in that situation to avoid jank
    if (topPosition < sensitivity && !(this._isSafari && topPosition < 0)) {
      scrollableElement.scrollTop += speed
    } else if (bottomPosition < sensitivity && !(this._isSafari && bottomPosition < 0)) {
      scrollableElement.scrollTop -= speed
    }

    if (rect.left + offsetWidth - clientX < sensitivity) {
      scrollableElement.scrollLeft += speed
    } else if (clientX - rect.left < sensitivity) {
      scrollableElement.scrollLeft -= speed
    }

    this.scrollAnimationFrame = requestAnimationFrame(() => this._scroll())
  }
}
