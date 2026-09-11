// NOTE: the DOM-walk helpers in this file (getParent, sibling lookups,
// scrollable-element lookups) are vendor-synced with the inkling-card-gallery
// repo, which keeps its own copy. There is no shared package yet — any
// behavior change here must be mirrored there, and vice versa. The
// drop-allowance / insert-index rules that used to live here
// (isCardDropAllowed) were consolidated into @/utils/draggable/reorder-rules,
// which is deliberately NOT synced — the gallery repo keeps its own
// direction-specific copy.
//
// unlike Element.closest, getParent can match the passed-in element itself;
// the name is kept for parity with the inkling-card-gallery copy — renaming
// requires changing both repos (see header note)
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

export function getParentScrollableElement(element: Element | null): HTMLElement {
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

  return scrollableElement instanceof HTMLElement ? scrollableElement : getDocumentScrollingElement()
}

export function getDocumentScrollingElement(): HTMLElement {
  return document.scrollingElement instanceof HTMLElement ? document.scrollingElement : document.documentElement
}

export function applyUserSelect(element: HTMLElement, value: string): void {
  element.style.setProperty('-webkit-user-select', value)
  // the moz/ms/o prefixes have no IDL attribute in the DOM lib — setProperty
  // is the typed mechanism for vendor-prefixed properties
  element.style.setProperty('-moz-user-select', value)
  element.style.setProperty('-ms-user-select', value)
  element.style.setProperty('-o-user-select', value)
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

  const matches = typeof value === 'string' ? (current: Element) => current.matches(value) : value

  let current: Element | null = element

  do {
    if (matches(current)) {
      return current
    }

    current = next(current)
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
