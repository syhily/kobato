/** Faithful copy of Koenig's getScrollParent.js */
export function getScrollParent(node: Node | null): HTMLElement {
  const isElement = node instanceof HTMLElement
  const overflowY = isElement && window.getComputedStyle(node).overflowY
  const isScrollable = overflowY !== 'visible' && overflowY !== 'hidden'

  if (!node) {
    return document.body
  } else if (isScrollable && (node as HTMLElement).scrollHeight >= (node as HTMLElement).clientHeight) {
    return node as HTMLElement
  }

  return getScrollParent(node.parentNode) || document.body
}
