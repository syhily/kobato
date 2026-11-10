import { getTopLevelNativeElement } from '@/inkling/utils/getTopLevelNativeElement'

/**
 * `nativeSelection` is the window selection, `threshold` an estimated line height in px.
 * Returns whether the selection sits at the top of its node.
 */
export function $isAtTopOfNode(nativeSelection: Selection, threshold = 10): boolean | undefined {
  const range = nativeSelection.getRangeAt(0).cloneRange()
  const rects = range.getClientRects()

  if (rects.length > 0) {
    // When the caret is at the start of a line the first rect sits on the line above and
    // breaks the top check, so prefer the second rect
    const rangeRect = rects[1] || rects[0]
    const nativeTopLevelElement = getTopLevelNativeElement(nativeSelection.anchorNode)
    if (!nativeTopLevelElement) {
      return undefined
    }
    const elemRect = nativeTopLevelElement.getBoundingClientRect()

    return Math.abs(rangeRect.top - elemRect.top) <= threshold
  }
  return undefined
}
