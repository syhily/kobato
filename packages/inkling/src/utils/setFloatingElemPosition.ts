// Floating element placement — the floating toolbar's "always above the
// target, horizontally centered, clamped into the scroller" positioning,
// projected onto @/utils/fit-rect's 'clamp-above' policy. The DOM edge
// (measuring the element/scroller rects, writing the styles) stays here.

import { ANCHOR_POPUP_GAP, fitRectWithin } from '@/utils/fit-rect'

interface SetFloatingElemPositionOptions {
  verticalGap?: number
  controlOpacity?: boolean
}

export function setFloatingElemPosition(
  targetRect: DOMRect | null | undefined,
  floatingElem: HTMLElement | null,
  anchorElem: HTMLElement,
  options: SetFloatingElemPositionOptions = {},
): void {
  const { verticalGap = ANCHOR_POPUP_GAP, controlOpacity = false } = options

  const scrollerElem = anchorElem.parentElement

  if (!targetRect || !scrollerElem || !floatingElem) {
    return
  }

  const floatingElemRect = floatingElem.getBoundingClientRect()
  const editorScrollerRect = scrollerElem.getBoundingClientRect()

  const fitted = fitRectWithin({
    bounds: { top: 0, left: editorScrollerRect.left, right: editorScrollerRect.right, bottom: 0 },
    rect: targetRect,
    size: { width: floatingElemRect.width, height: floatingElemRect.height },
    gap: verticalGap,
    policy: 'clamp-above',
  })

  if (controlOpacity) {
    floatingElem.style.opacity = '1'
  }
  floatingElem.style.top = `${fitted.top}px`
  floatingElem.style.left = `${fitted.left}px`
}
