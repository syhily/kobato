// Pure TK indicator geometry and click-to-cycle policy behind TKPlugin: the
// indicator placement against the editor root rect (below-the-containing-element
// top with an overflow-right adjustment) and the cycle order through a card's
// TK nodes. Rects arrive as plain data (the ReorderGeometry pattern from
// @/utils/draggable/reorder-rules), so both tables are unit-testable without
// layout; TKPlugin stays the adapter owning measuring, rendering, and editor
// wiring.

/** Base right offset placing the indicator left of the editor root's right edge. */
export const TK_INDICATOR_BASE_RIGHT = -56

/** Vertical nudge below the containing element's top edge. */
export const TK_INDICATOR_TOP_OFFSET = 4

/** Plain-data view of a DOMRect — only the edges the indicator math reads. */
export interface TkRectLike {
  top: number
  right: number
}

export interface TkIndicatorPosition {
  top: number
  right: number
}

/**
 * Resolves the indicator's position relative to the editor root: the containing
 * element's top (plus TK_INDICATOR_TOP_OFFSET) measured against the root's top,
 * and the base right offset pushed further left when the containing element
 * overflows the root's right edge. Null rects (no containing element) fall
 * back to the root corner.
 */
export function resolveTkIndicatorPosition(
  rootRect: TkRectLike | null,
  positioningRect: TkRectLike | null,
): TkIndicatorPosition {
  if (!rootRect || !positioningRect) {
    return { top: 0, right: TK_INDICATOR_BASE_RIGHT }
  }

  let right = TK_INDICATOR_BASE_RIGHT

  const top = positioningRect.top - rootRect.top + TK_INDICATOR_TOP_OFFSET

  if (positioningRect.right > rootRect.right) {
    right = right - (positioningRect.right - rootRect.right)
  }

  return { top, right }
}

/**
 * Resolves the next TK node to select when the indicator is clicked: the first
 * node when nothing (or an unknown key) is selected, the following node
 * otherwise, wrapping to the first after the last. Undefined when the card has
 * no TK nodes.
 */
export function nextTkNodeKey(nodeKeys: readonly string[], currentKey: string | null): string | undefined {
  if (nodeKeys.length === 0) {
    return undefined
  }

  if (currentKey === null) {
    return nodeKeys[0]
  }

  const selectedIndex = nodeKeys.indexOf(currentKey)

  if (selectedIndex === nodeKeys.length - 1) {
    return nodeKeys[0]
  }

  return nodeKeys[selectedIndex + 1]
}
