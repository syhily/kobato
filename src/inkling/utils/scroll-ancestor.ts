import { getParentScrollableElement } from '@/inkling/utils/draggable/draggable-utils'

// Two named policies keep the scrollable-ancestor walks from silently diverging: 'floating'
// checks overflowY only; 'drag-scroll' is position-aware (an absolutely positioned draggable
// skips statically positioned ancestors). The inkling-card-gallery mirror keeps its own
// vendored copy.

export type ScrollAncestorPolicy = 'floating' | 'drag-scroll'

export function getScrollAncestor(node: HTMLElement | null, policy: ScrollAncestorPolicy = 'floating'): HTMLElement {
  if (policy === 'drag-scroll') {
    return getParentScrollableElement(node)
  }

  if (!node) {
    return document.body
  }
  const overflowY = window.getComputedStyle(node).overflowY
  const isScrollable = overflowY !== 'visible' && overflowY !== 'hidden'

  if (isScrollable && node.scrollHeight >= node.clientHeight) {
    return node
  }

  const parent = node.parentNode instanceof HTMLElement ? node.parentNode : null
  return getScrollAncestor(parent, policy)
}
