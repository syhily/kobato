import { getParentScrollableElement } from '@kobato/inkling-internal/utils/draggable/draggable-utils'

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
