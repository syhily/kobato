export const ANCHOR_POPUP_GAP = 10

export interface FitRect {
  top: number
  left: number
  width: number
  height: number
}

export interface FitSize {
  width: number
  height: number
}

export interface FitBounds {
  top: number
  left: number
  right: number
  bottom: number
}

export interface FitRectEdges {
  top: number
  right: number
  bottom: number
  left: number
}

export type FitRectGap = number | Partial<FitRectEdges> | { below?: number; above?: number }
export type FitRectPolicy = 'clamp' | 'flip-below-above' | 'clamp-above'
export interface FitRectWithinInput {
  bounds: FitBounds

  rect: FitRect
  size?: FitSize
  gap?: FitRectGap
  policy: FitRectPolicy
  belowBudget?: number
  requireFitAbove?: boolean
}

export interface FittedRectPosition {
  top: number
  left: number
  flipped: boolean
}

function isSideGap(
  gap: Partial<FitRectEdges> | { below?: number; above?: number },
): gap is { below?: number; above?: number } {
  return 'below' in gap || 'above' in gap
}

function resolveGapEdges(gap: FitRectGap | undefined): FitRectEdges {
  if (gap === undefined) {
    return { top: 0, right: 0, bottom: 0, left: 0 }
  }
  if (typeof gap === 'number') {
    return { top: gap, right: gap, bottom: gap, left: gap }
  }
  if (isSideGap(gap)) {
    return { top: gap.above ?? 0, right: 0, bottom: gap.below ?? 0, left: 0 }
  }
  return { top: gap.top ?? 0, right: gap.right ?? 0, bottom: gap.bottom ?? 0, left: gap.left ?? 0 }
}

export function fitRectWithin({
  bounds,
  rect,
  size,
  gap,
  policy,
  belowBudget,
  requireFitAbove,
}: FitRectWithinInput): FittedRectPosition {
  const edges = resolveGapEdges(gap)
  if (policy === 'clamp') {
    const inner = {
      top: bounds.top + edges.top,
      right: bounds.right - edges.right,
      bottom: bounds.bottom - edges.bottom,
      left: bounds.left + edges.left,
    }
    const topOffscreen = rect.top < inner.top
    const bottomOffscreen = rect.top + rect.height > inner.bottom
    const rightOffscreen = rect.left + rect.width > inner.right
    const leftOffscreen = rect.left < inner.left

    let top = rect.top
    let left = rect.left
    if (topOffscreen && !bottomOffscreen) {
      top = inner.top
    }
    if (bottomOffscreen && !topOffscreen) {
      top = inner.bottom - rect.height
    }
    if (rightOffscreen) {
      left = inner.right - rect.width
    }
    if (leftOffscreen) {
      left = inner.left
    }
    return { top, left, flipped: false }
  }

  const placed = size ?? { width: rect.width, height: rect.height }

  if (policy === 'flip-below-above') {
    const belowTop = rect.top + rect.height + edges.bottom
    const aboveTop = rect.top - placed.height - edges.top
    const overflows = belowTop + (belowBudget ?? placed.height) > bounds.bottom
    if (overflows && (!requireFitAbove || aboveTop >= bounds.top)) {
      return { top: aboveTop, left: rect.left, flipped: true }
    }
    return { top: belowTop, left: rect.left, flipped: false }
  }

  const top = rect.top - placed.height - edges.top
  let left = rect.left + rect.width / 2 - placed.width / 2
  if (left < bounds.left) {
    left = bounds.left
  }
  if (left + placed.width > bounds.right) {
    left = bounds.right - placed.width
  }
  return { top, left, flipped: false }
}
