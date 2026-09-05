import { getParentScrollableElement } from '@/utils/draggable/draggable-utils'

// The one "nearest scrollable ancestor" front door. Two policies, NAMED
// rather than silently divergent (the previous two implementations each had
// their own test file pinning the difference):
//
// - 'floating' (popups, panels, toolbars): overflowY only, the
//   scrollHeight-vs-clientHeight gate, falls back to document.body — the
//   floating-position family's semantics.
// - 'drag-scroll' (drag auto-scroll): position-aware (an absolutely
//   positioned dragggee skips statically positioned ancestors), both axes,
//   falls back to the document scrolling element — the drag handler's
//   semantics, delegated to the vendor-synced implementation in
//   draggable-utils (the inkling-card-gallery mirror keeps that copy).

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
