export const TK_INDICATOR_BASE_RIGHT = -56
export const TK_INDICATOR_TOP_OFFSET = 4

export interface TkRectLike {
  top: number
  right: number
}
export interface TkIndicatorPosition {
  top: number
  right: number
}

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
