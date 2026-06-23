/**
 * Find the nearest scrollable ancestor — ported from Koenig's getScrollParent.js.
 *
 * Used by FloatingToolbar to attach scroll listeners for repositioning.
 */
export function getScrollParent(element: HTMLElement | null): HTMLElement {
  if (element === null) {
    return document.body
  }

  const style = getComputedStyle(element)
  const overflow = style.overflowY

  if (overflow === 'auto' || overflow === 'scroll' || overflow === 'overlay') {
    return element
  }

  return getScrollParent(element.parentElement)
}
