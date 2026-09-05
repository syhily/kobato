import { getTopLevelNativeElement } from '@/utils/getTopLevelNativeElement'

/**
 *
 * @param nativeSelection – Window selection (window.getSelection())
 * @param threshold – Estimated height of one line, in pixels
 * @returns whether the selection is at the top of its node
 */
export function $isAtTopOfNode(nativeSelection: Selection, threshold = 10): boolean | undefined {
  const range = nativeSelection.getRangeAt(0).cloneRange()
  const rects = range.getClientRects()

  if (rects.length > 0) {
    // try second rect first because when the caret is at the beginning
    // of a line the first rect will be positioned on line above breaking
    // the top position check
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
