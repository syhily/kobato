// Rect fitting — the one pure placement primitive behind every "fit this rect
// within these bounds" decision in the editor. Three named policies:
// 'clamp' (shift a proposed rect the minimum amount so it keeps its gap from
// the bounds — the settings panel's settle/drag clamps), 'flip-below-above'
// (place below an anchor, flip above when the below placement overflows the
// bounds — the selection-anchored popups' budget flip and measured flip), and
// 'clamp-above' (always above the anchor, horizontally centered and clamped
// into the bounds, never flips — the floating toolbar). Rects arrive as plain
// data, so every policy is unit-testable without layout; the consumers keep
// their own policy differences and ports and only project the math onto this
// primitive. ANCHOR_POPUP_GAP is the single source for the 10px anchor↔popup
// gap shared by the popup modules and the floating toolbar — the settings
// panel's CARD_SPACING (20px, panel-to-card distance) is a different semantic
// and stays in @/utils/floating-panel.

/** Vertical gap between an anchor rect and the popup placed against it. */
export const ANCHOR_POPUP_GAP = 10

/** A rect as plain data — the seam the fitting policies are tested through. */
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

/** The edges the placed rect is fitted against (viewport or scroll-container edges, in the rect's coordinate space). */
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

/**
 * The gap a policy keeps: a number (every edge), per-edge insets ('clamp'),
 * or { below, above } anchor-side gaps (the anchor policies). below/above map
 * onto the bottom/top edges, so one normalization serves every policy.
 */
export type FitRectGap = number | Partial<FitRectEdges> | { below?: number; above?: number }

export type FitRectPolicy = 'clamp' | 'flip-below-above' | 'clamp-above'

export interface FitRectWithinInput {
  /** Bounds the placed rect is fitted against, in the rect's own coordinate space. */
  bounds: FitBounds
  /**
   * 'clamp': the rect at its proposed position (fitted by shifting it).
   * The anchor policies: the anchor rect the placed rect sits against.
   */
  rect: FitRect
  /** Anchor policies: the size of the rect being placed (its position is what gets resolved). */
  size?: FitSize
  /** Gap from the bounds ('clamp') or from the anchor (anchor policies). Defaults to 0. */
  gap?: FitRectGap
  policy: FitRectPolicy
  /** 'flip-below-above': height reserved below the anchor when judging overflow; defaults to the placed height. */
  belowBudget?: number
  /** 'flip-below-above': flip only when the flipped placement also fits within the bounds top. */
  requireFitAbove?: boolean
}

export interface FittedRectPosition {
  top: number
  left: number
  /** 'flip-below-above': whether the rect was flipped above the anchor. Always false for the other policies. */
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

/**
 * Fits a rect within bounds under a named policy. 'clamp' shifts the proposed
 * rect so it keeps the gap from the (gap-inset) bounds — a rect offscreen on
 * both vertical edges is left alone (nothing fits it), and horizontally the
 * left edge wins when both overflow, both judged on the proposed position.
 * 'flip-below-above' places the rect below the anchor with the below gap and
 * flips it above (with the above gap) when the below placement plus its
 * budget overflows the bounds bottom. 'clamp-above' always places the rect
 * above the anchor, horizontally centered on it and clamped into the
 * horizontal bounds — never flips.
 */
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

  // clamp-above: always above the anchor, centered horizontally on it,
  // clamped into the horizontal bounds (the right edge wins when both overflow)
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
