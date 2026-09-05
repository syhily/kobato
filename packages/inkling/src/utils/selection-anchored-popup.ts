import { $getSelection, type LexicalEditor } from 'lexical'

import { $getSelectionRangeRect } from '@/utils/$getSelectionRangeRect'
import { ANCHOR_POPUP_GAP, fitRectWithin } from '@/utils/fit-rect'

// Anchored popup layout — the one module owning how a popup is placed against
// its anchor. Two positioning modes share the module: 'fixed' (viewport
// coords, spans the container's full width, flips above the anchor when the
// below position plus the max-height budget would overflow the scroll
// container — the at-link results popup and the link-action toolbar) and
// 'absolute' (parent-relative offsets at natural width — the slash and plus
// card menus, whose per-policy flip rules arrive as inputs). Both flip rules
// project onto @/utils/fit-rect's 'flip-below-above' policy. Rects arrive as
// plain data (the ReorderGeometry pattern from
// @/utils/draggable/reorder-rules), so every policy is unit-testable with
// fake rects. The anchor adapters (node-element rect, selection-range rect)
// live here at the edge; the React adapter that owns measuring, style
// writes, and the resize/scroll/MutationObserver subscription set is
// @/hooks/useSelectionAnchoredPopup.

/** Vertical gap between the anchor rect and the popup placed below it. Alias of @/utils/fit-rect's ANCHOR_POPUP_GAP (the single source). */
export const POPUP_VERTICAL_GAP = ANCHOR_POPUP_GAP

/**
 * Max height of the scrollable results list inside a selection-anchored popup.
 * Single-sourced here: the CSS side reads POPUP_LIST_MAX_HEIGHT (inline style —
 * a tailwind arbitrary value cannot reference a JS constant), and the flip rule
 * reserves the same height through popupMaxHeightBudget, so the two can never
 * drift apart.
 */
export const POPUP_LIST_MAX_HEIGHT_VH = 30
export const POPUP_LIST_MAX_HEIGHT = `${POPUP_LIST_MAX_HEIGHT_VH}vh`

/** Height of the toolbar row rendered above the results list (link input row). */
export const POPUP_TOOLBAR_HEIGHT_PX = 54

/**
 * The popup max-height budget used by the flip rule: the results list
 * (POPUP_LIST_MAX_HEIGHT_VH) plus the toolbar row (POPUP_TOOLBAR_HEIGHT_PX).
 * The flip reserves the full budget rather than the popup's current height so
 * the popup does not jump between above/below placement as the results list
 * changes size.
 */
export function popupMaxHeightBudget(viewportHeight: number): number {
  return (viewportHeight / 100) * POPUP_LIST_MAX_HEIGHT_VH + POPUP_TOOLBAR_HEIGHT_PX
}

/** Plain-data view of a DOMRect — the seam the layout rules are tested through. */
export interface PopupRectLike {
  top: number
  bottom: number
  left: number
  right: number
  width: number
  height: number
}

export interface AnchoredPopupLayoutInput {
  /** Rect the popup is anchored to (node element or selection range). */
  anchorRect: PopupRectLike
  /** Fixed mode: the rect the popup spans horizontally (the editor container). Absolute mode: the positioning parent's rect (offsets resolve against it). */
  containerRect: PopupRectLike
  /** Popup height measured at its final width. */
  popupHeight: number
  scrollTop: number
  scrollHeight: number
  viewportHeight: number
  /** Gap below the anchor; defaults to POPUP_VERTICAL_GAP in fixed mode, 0 in absolute mode (the menus carry their own margin). */
  gap?: number
  /** Gap above the anchor when flipped; defaults to the below gap. */
  aboveGap?: number
  /**
   * 'fixed' (default): viewport coordinates, spans the container's width,
   * budget flip. 'absolute': parent-relative offsets at natural width, the
   * `absoluteEdge`/`absoluteFlip` policies.
   */
  positioning?: 'fixed' | 'absolute'
  /** Absolute mode: the unflipped popup sits below the anchor (slash menu) or at the anchor's top (plus button). Defaults to 'below'. */
  absoluteEdge?: 'below' | 'at-anchor'
  /**
   * Absolute mode: 'measured' flips the popup above the anchor when the
   * below position overflows the viewport AND the popup fits above;
   * 'never' (default) never flips.
   */
  absoluteFlip?: 'measured' | 'never'
}

export interface AnchoredPopupPlacement {
  /** Fixed mode: viewport top. Absolute mode: the parent-relative top offset — absent when flipped (bottom is set instead). */
  top?: number
  /** Absolute mode only, set when flipped: the parent-relative bottom offset placing the popup above the anchor. */
  bottom?: number
  left: number
  /** Fixed mode only: the container-spanning width. Absolute mode is natural-width. */
  width?: number
  /** True when the popup was flipped above the anchor. */
  flipped: boolean
}

/**
 * Resolves the popup's placement against its anchor. Fixed mode: below the
 * anchor, spanning the container horizontally, flipping above when the below
 * position plus the max-height budget would overflow the scroll container.
 * Absolute mode: the parent-relative offset named by the edge policy, with
 * the measured flip placing the popup above the anchor only when the below
 * position overflows the viewport and the popup fits above.
 */
export function resolveAnchoredPopupPlacement({
  anchorRect,
  containerRect,
  popupHeight,
  scrollTop,
  scrollHeight,
  viewportHeight,
  gap,
  aboveGap,
  positioning = 'fixed',
  absoluteEdge = 'below',
  absoluteFlip = 'never',
}: AnchoredPopupLayoutInput): AnchoredPopupPlacement {
  if (positioning === 'absolute') {
    const anchorTop = anchorRect.top - containerRect.top
    if (absoluteEdge === 'at-anchor') {
      return { top: anchorTop, left: 0, flipped: false }
    }

    // below the anchor; the measured flip fires only when below overflows
    // the viewport and the popup fits above — both judged in the anchor
    // rect's native viewport coordinates
    if (absoluteFlip === 'measured') {
      const fitted = fitRectWithin({
        bounds: { top: 0, left: 0, right: 0, bottom: viewportHeight },
        rect: anchorRect,
        size: { width: 0, height: popupHeight },
        policy: 'flip-below-above',
        requireFitAbove: true,
      })
      if (fitted.flipped) {
        return { bottom: containerRect.height - anchorTop, left: 0, flipped: true }
      }
    }
    return { top: anchorTop + anchorRect.height, left: 0, flipped: false }
  }

  const belowGap = gap ?? POPUP_VERTICAL_GAP
  // the flip is judged against the scroll container's document extent,
  // shifted into the anchor's viewport coordinates: the visible region's
  // bottom edge sits at scrollHeight - scrollTop
  const fitted = fitRectWithin({
    bounds: { top: 0, left: 0, right: 0, bottom: scrollHeight - scrollTop },
    rect: anchorRect,
    size: { width: 0, height: popupHeight },
    gap: { below: belowGap, above: aboveGap ?? belowGap },
    policy: 'flip-below-above',
    belowBudget: popupMaxHeightBudget(viewportHeight),
  })

  return {
    top: fitted.top,
    left: containerRect.left,
    width: containerRect.right - containerRect.left,
    flipped: fitted.flipped,
  }
}

/**
 * Anchor-rect provider for a selection-anchored popup. Resolved inside an
 * editor update (the React adapter owns that), so it may read the selection.
 * Returns null when the popup should not (re)position — including when there
 * is no selection, matching the historical behaviour of both popup call sites.
 */
export type PopupAnchor = () => DOMRect | null

/** Anchor adapter: the bounding rect of a node's element (at-link results popup). */
export function createNodeElementAnchor(editor: LexicalEditor, nodeKey: string): PopupAnchor {
  return () => {
    if (!$getSelection()) {
      return null
    }
    return editor.getElementByKey(nodeKey)?.getBoundingClientRect() ?? null
  }
}

/** Anchor adapter: the bounding rect of the current selection range (link-action toolbar). */
export function createSelectionAnchor(editor: LexicalEditor): PopupAnchor {
  return () => $getSelectionRangeRect({ editor, selection: $getSelection() })
}
