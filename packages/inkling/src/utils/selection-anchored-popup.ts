import { $getSelectionRangeRect } from '@kobato/inkling-internal/utils/$getSelectionRangeRect'
import { ANCHOR_POPUP_GAP, fitRectWithin } from '@kobato/inkling-internal/utils/fit-rect'
import { $getSelection, type LexicalEditor } from 'lexical'

export const POPUP_VERTICAL_GAP = ANCHOR_POPUP_GAP
/**
 * Max height of the scrollable results list inside a selection-anchored popup, single
 * sourced here: the CSS side reads POPUP_LIST_MAX_HEIGHT as an inline style (a Tailwind
 * arbitrary value cannot reference a JS constant) and the flip rule reserves the same
 * height through popupMaxHeightBudget, so the two cannot drift.
 */
export const POPUP_LIST_MAX_HEIGHT_VH = 30
export const POPUP_LIST_MAX_HEIGHT = `${POPUP_LIST_MAX_HEIGHT_VH}vh`

export const POPUP_TOOLBAR_HEIGHT_PX = 54

export function popupMaxHeightBudget(viewportHeight: number): number {
  return (viewportHeight / 100) * POPUP_LIST_MAX_HEIGHT_VH + POPUP_TOOLBAR_HEIGHT_PX
}
export interface PopupRectLike {
  top: number
  bottom: number
  left: number
  right: number
  width: number
  height: number
}

export interface AnchoredPopupLayoutInput {
  anchorRect: PopupRectLike

  containerRect: PopupRectLike

  popupHeight: number
  scrollTop: number
  scrollHeight: number
  viewportHeight: number

  gap?: number

  aboveGap?: number

  positioning?: 'fixed' | 'absolute'

  coordinateScale?: number
  absoluteEdge?: 'below' | 'at-anchor'
  absoluteFlip?: 'measured' | 'never'
}
export interface AnchoredPopupPlacement {
  top?: number

  bottom?: number
  left: number
  width?: number
  flipped: boolean
}

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

export type PopupAnchor = () => DOMRect | null

export function createNodeElementAnchor(editor: LexicalEditor, nodeKey: string): PopupAnchor {
  return () => {
    if (!$getSelection()) {
      return null
    }
    return editor.getElementByKey(nodeKey)?.getBoundingClientRect() ?? null
  }
}

export function createSelectionAnchor(editor: LexicalEditor): PopupAnchor {
  return () => $getSelectionRangeRect({ editor, selection: $getSelection() })
}
