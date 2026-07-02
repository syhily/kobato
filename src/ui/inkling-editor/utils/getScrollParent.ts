export function getScrollParent(node: HTMLElement | null): HTMLElement {
  if (!node) {
    return document.body
  }
  const overflowY = window.getComputedStyle(node).overflowY
  const isScrollable = overflowY !== 'visible' && overflowY !== 'hidden'

  if (isScrollable && node.scrollHeight >= node.clientHeight) {
    return node
  }

  const parent = node.parentNode instanceof HTMLElement ? node.parentNode : null
  return getScrollParent(parent) || document.body
}
