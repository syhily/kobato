// adapted from draggable.js Scrollable plugin (MIT)
// https://github.com/Shopify/draggable/blob/master/src/Draggable/Plugins/Scrollable/Scrollable.js
import type { DraggableInfo } from '@/ui/inkling-editor/utils/draggable/DragDropContainer'

import {
  getDocumentScrollingElement,
  getParentScrollableElement,
} from '@/ui/inkling-editor/utils/draggable/draggable-utils'

export const defaultOptions = {
  speed: 8,
  sensitivity: 50,
}

interface MousePosition {
  clientX: number
  clientY: number
}

export class ScrollHandler {
  options: typeof defaultOptions
  currentMousePosition: MousePosition | null = null
  findScrollableElementFrame: number | null = null
  scrollableElement: HTMLElement | null = null
  scrollAnimationFrame: number | null = null
  _isSafari: boolean

  constructor() {
    this.options = Object.assign({}, defaultOptions)

    this._isSafari = navigator.userAgent.indexOf('Safari') !== -1 && navigator.userAgent.indexOf('Chrome') === -1

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

    if (draggableInfo.mousePosition) {
      this.currentMousePosition = {
        clientX: draggableInfo.mousePosition.x,
        clientY: draggableInfo.mousePosition.y,
      }
    }

    this.scrollAnimationFrame = requestAnimationFrame(this._scroll)
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

  getScrollableElement(target: HTMLElement): HTMLElement | null {
    const found = getParentScrollableElement(target)
    if (!found) {
      return null
    }

    // workaround for our particular scrolling setup
    // TODO: find a way to make this configurable
    if (found === getDocumentScrollingElement()) {
      // TODO: will only work inside Admin
      const adminEditor = document.querySelector<HTMLElement>('.gh-inkling-editor')
      return adminEditor ?? (found as HTMLElement)
    }

    return found as HTMLElement
  }

  _scroll() {
    if (!this.scrollableElement || !this.currentMousePosition) {
      return
    }

    if (this.scrollAnimationFrame) {
      cancelAnimationFrame(this.scrollAnimationFrame)
    }

    const { speed, sensitivity } = this.options

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

    this.scrollAnimationFrame = requestAnimationFrame(this._scroll)
  }
}
