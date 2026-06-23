/**
 * Floating element positioning — faithful port of Koenig's setFloatingElemPosition.js.
 *
 * Positions a floating toolbar above a selection rect, clamped horizontally
 * to the editor's scroll container (anchorElem.parentElement).
 */
const VERTICAL_GAP = 10

export function setFloatingElemPosition(
  targetRect: DOMRect | null,
  floatingElem: HTMLElement,
  anchorElem: HTMLElement,
  options: { verticalGap?: number; controlOpacity?: boolean } = {},
): void {
  const { verticalGap = VERTICAL_GAP, controlOpacity = false } = options

  const scrollerElem = anchorElem.parentElement

  if (!targetRect || !scrollerElem || !floatingElem) {
    return
  }

  const floatingElemRect = floatingElem.getBoundingClientRect()
  const editorScrollerRect = scrollerElem.getBoundingClientRect()

  const top = targetRect.top - floatingElemRect.height - verticalGap
  let left = targetRect.left + targetRect.width / 2 - floatingElemRect.width / 2

  if (left < editorScrollerRect.left) {
    left = editorScrollerRect.left
  }

  if (left + floatingElemRect.width > editorScrollerRect.right) {
    left = editorScrollerRect.right - floatingElemRect.width
  }

  if (controlOpacity) {
    floatingElem.style.opacity = '1'
  }
  floatingElem.style.top = `${top}px`
  floatingElem.style.left = `${left}px`
}
