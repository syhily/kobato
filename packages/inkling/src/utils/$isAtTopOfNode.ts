import { getTopLevelNativeElement } from '@kobato/inkling-internal/utils/get-top-level-native-element'

export function $isAtTopOfNode(nativeSelection: Selection, threshold = 10): boolean | undefined {
  const range = nativeSelection.getRangeAt(0).cloneRange()
  const rects = range.getClientRects()

  if (rects.length > 0) {
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
