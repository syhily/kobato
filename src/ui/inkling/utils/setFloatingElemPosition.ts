/**
 * Floating element positioning — ported from Koenig's setFloatingElemPosition.js.
 *
 * Positions a floating toolbar above a selection rect, clamped horizontally
 * to the editor's scroll container. Pure function — no side effects beyond
 * setting inline styles on the floating element.
 *
 * @param targetRect    - DOMRect of the text selection
 * @param floatingElem   - The floating toolbar DOM element
 * @param anchorElem     - The editor's scroll container (positioned ancestor)
 * @param verticalGap    - Pixels between selection top and toolbar bottom (default 10)
 * @param controlOpacity - If true, sets opacity:0 until positioned then opacity:1 (default true)
 */
export function setFloatingElemPosition(
  targetRect: DOMRect,
  floatingElem: HTMLElement,
  anchorElem: HTMLElement,
  verticalGap = 10,
  controlOpacity = true,
): void {
  const floatingElemRect = floatingElem.getBoundingClientRect()
  const anchorScrollerRect = anchorElem.getBoundingClientRect()

  if (floatingElemRect.width === 0 || floatingElemRect.height === 0) {
    return
  }

  let top = targetRect.top - floatingElemRect.height - verticalGap
  let left = targetRect.left + targetRect.width / 2 - floatingElemRect.width / 2

  // Clamp horizontally so the toolbar never overflows the editor scroller
  if (left < anchorScrollerRect.left) {
    left = anchorScrollerRect.left
  }
  if (left + floatingElemRect.width > anchorScrollerRect.right) {
    left = anchorScrollerRect.right - floatingElemRect.width
  }

  floatingElem.style.left = `${left}px`
  floatingElem.style.top = `${top}px`
  floatingElem.style.opacity = controlOpacity ? '1' : floatingElem.style.opacity
}
