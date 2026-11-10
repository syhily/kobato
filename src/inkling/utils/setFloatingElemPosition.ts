// Floating element placement: always above the target and horizontally centered, clamped
// into the scroller. Measuring and style writes stay here.

import { ANCHOR_POPUP_GAP, fitRectWithin } from '@/inkling/utils/fit-rect'

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
