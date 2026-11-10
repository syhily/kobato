import { $getSelection, type LexicalEditor } from 'lexical'

import { $getSelectionRangeRect } from '@/inkling/utils/$getSelectionRangeRect'
import { ANCHOR_POPUP_GAP, fitRectWithin } from '@/inkling/utils/fit-rect'

// Two positioning modes: 'fixed' (viewport coords, spans the container's width, flips above
// the anchor when the below position plus the max-height budget would overflow the scroll
// container) and 'absolute' (parent-relative offsets at natural width, per-policy flip
// rules as inputs). Both flip rules project onto fit-rect's 'flip-below-above' policy;
// useSelectionAnchoredPopup owns measuring and style writes.

/** Vertical gap between the anchor rect and the popup placed below it. Alias of fit-rect's ANCHOR_POPUP_GAP, the single source. */
export const POPUP_VERTICAL_GAP = ANCHOR_POPUP_GAP

/**
 * Max height of the scrollable results list inside a selection-anchored popup, single
 * sourced here: the CSS side reads POPUP_LIST_MAX_HEIGHT as an inline style (a Tailwind
 * arbitrary value cannot reference a JS constant) and the flip rule reserves the same
 * height through popupMaxHeightBudget, so the two cannot drift.
 */
export const POPUP_LIST_MAX_HEIGHT_VH = 30
export const POPUP_LIST_MAX_HEIGHT = `${POPUP_LIST_MAX_HEIGHT_VH}vh`

/** Height of the toolbar row rendered above the results list (link input row). */
export const POPUP_TOOLBAR_HEIGHT_PX = 54

/**
 * The max-height budget used by the flip rule: results list plus toolbar row. The flip
 * reserves the full budget rather than the popup's current height so the popup does not
 * jump between above/below as the results list changes size.
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
  /**
   * Absolute mode only: the positioning parent's viewport-to-local scale (CSS `zoom`).
   * Rects arrive in viewport (scaled) coordinates, but the written parent-relative offsets
   * live in the parent's unscaled local space — under a zoomed canvas they must be
   * un-scaled or the zoom applies twice. Defaults to 1.
   */
  coordinateScale?: number
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
 * Resolves the popup's placement against its anchor. Absolute-mode offsets are divided by
 * `coordinateScale`; the flip decision stays in viewport coordinates.
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
  coordinateScale,
  absoluteEdge = 'below',
  absoluteFlip = 'never',
}: AnchoredPopupLayoutInput): AnchoredPopupPlacement {
  if (positioning === 'absolute') {
    const scale = coordinateScale && coordinateScale > 0 ? coordinateScale : 1
    const anchorTop = (anchorRect.top - containerRect.top) / scale
    if (absoluteEdge === 'at-anchor') {
      return { top: anchorTop, left: 0, flipped: false }
    }

    // Below the anchor; the measured flip fires only when below overflows the viewport and
    // the popup fits above, both judged in the anchor rect's viewport coordinates.
    if (absoluteFlip === 'measured') {
      const fitted = fitRectWithin({
        bounds: { top: 0, left: 0, right: 0, bottom: viewportHeight },
        rect: anchorRect,
        size: { width: 0, height: popupHeight },
        policy: 'flip-below-above',
        requireFitAbove: true,
      })
      if (fitted.flipped) {
        return { bottom: containerRect.height / scale - anchorTop, left: 0, flipped: true }
      }
    }
    return { top: anchorTop + anchorRect.height / scale, left: 0, flipped: false }
  }

  const belowGap = gap ?? POPUP_VERTICAL_GAP
  // The flip is judged against the scroll container's document extent shifted into the
  // anchor's viewport coordinates: the visible region's bottom edge sits at
  // scrollHeight - scrollTop.
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
 * Anchor-rect provider for a selection-anchored popup. Resolved inside an editor update (the
 * React adapter owns that), so it may read the selection. Returns null when the popup
 * should not (re)position, including when there is no selection.
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
