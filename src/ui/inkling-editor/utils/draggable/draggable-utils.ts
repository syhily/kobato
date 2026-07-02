// Helper to set vendor-prefixed CSS properties not in the standard CSSStyleDeclaration type
function setVendorStyle(style: CSSStyleDeclaration, prop: string, value: string): void {
  ;(style as unknown as Record<string, string>)[prop] = value
}

// TODO: more or less duplicated in inkling-card-gallery other than direction
export function isCardDropAllowed(draggableIndex: number, droppableIndex: number, position = ''): boolean {
  // images can be dragged out of a gallery to any position
  if (draggableIndex === -1) {
    return true
  }

  // can't drop on itself or when droppableIndex doesn't exist
  if (draggableIndex === droppableIndex || typeof droppableIndex === 'undefined') {
    return false
  }

  // account for dropping at beginning or end of a row
  let adjustedDroppable = droppableIndex
  if (position.match(/top/)) {
    adjustedDroppable -= 1
  }

  if (position.match(/bottom/)) {
    adjustedDroppable += 1
  }

  return adjustedDroppable !== draggableIndex
}

// TODO: rename to closest? getParent can actually match passed in element
export function getParent(element: Element | null, value: string | ((el: Element) => boolean)): Element | null {
  return getWithMatch(element, value, (current: Element) => {
    const parent = current.parentNode
    return parent instanceof Element ? parent : null
  })
}

export function getNextSibling(element: Element | null, value: string | ((el: Element) => boolean)): Element | null {
  // don't match the passed in element
  const start = element?.nextElementSibling ?? null
  return getWithMatch(start, value, (current: Element) => current.nextElementSibling)
}

export function getPreviousSibling(
  element: Element | null,
  value: string | ((el: Element) => boolean),
): Element | null {
  // don't match the passed in element
  const start = element?.previousElementSibling ?? null
  return getWithMatch(start, value, (current: Element) => current.previousElementSibling)
}

export function getParentScrollableElement(element: Element | null): Element {
  if (!element) {
    return getDocumentScrollingElement()
  }

  const position = getComputedStyle(element).getPropertyValue('position')
  const excludeStaticParents = position === 'absolute'

  const scrollableElement = getParent(element, (parent) => {
    if (excludeStaticParents && isStaticallyPositioned(parent)) {
      return false
    }
    return hasOverflow(parent)
  })

  if (position === 'fixed' && !scrollableElement) {
    return getDocumentScrollingElement()
  } else {
    return scrollableElement || getDocumentScrollingElement()
  }
}

export function getDocumentScrollingElement(): Element {
  return document.scrollingElement || document.documentElement
}

export function applyUserSelect(element: HTMLElement, value: string): void {
  setVendorStyle(element.style, 'webkitUserSelect', value)
  setVendorStyle(element.style, 'mozUserSelect', value)
  setVendorStyle(element.style, 'msUserSelect', value)
  setVendorStyle(element.style, 'oUserSelect', value)
  element.style.userSelect = value
}

/* Not exported --------------------------------------------------------------*/

type ElementMatcher = string | ((el: Element) => boolean)

function getWithMatch(
  element: Element | null,
  value: ElementMatcher,
  next: (current: Element) => Element | null,
): Element | null {
  if (!element) {
    return null
  }

  const selector = typeof value === 'string' ? value : null
  const callback = typeof value === 'function' ? value : null
  const isSelector = typeof value === 'string'
  const isFunction = typeof value === 'function'

  function matches(currentElement: Element | null): Element | boolean | null {
    if (!currentElement) {
      return null
    } else if (isSelector && selector) {
      return currentElement.matches(selector)
    } else if (isFunction && callback) {
      return callback(currentElement)
    }
    return null
  }

  let current: Element | null = element

  do {
    if (matches(current)) {
      return current
    }

    current = current ? next(current) : null
  } while (current && current !== document.body && current !== document.documentElement)

  return null
}

function isStaticallyPositioned(element: Element): boolean {
  const position = getComputedStyle(element).getPropertyValue('position')
  return position === 'static'
}

function hasOverflow(element: Element): boolean {
  const overflowRegex = /(auto|scroll)/
  const computedStyles = getComputedStyle(element)

  const overflow =
    computedStyles.getPropertyValue('overflow') +
    computedStyles.getPropertyValue('overflow-y') +
    computedStyles.getPropertyValue('overflow-x')

  return overflowRegex.test(overflow)
}
