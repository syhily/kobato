import { createDOMRange, createRectsFromDOMRange } from '@lexical/selection'
import { $getSelection, $isRangeSelection, type LexicalEditor } from 'lexical'

/**
 * Get the bounding rect of the current selection — ported from Koenig's
 * $getSelectionRangeRect.js.
 *
 * For multi-line selections, finds the bounding box of all rects. Returns
 * null if there is no valid range selection or no DOM rects.
 *
 * Must be called inside an `editor.read()` / `editor.getEditorState().read()`
 * callback.
 */
export function $getSelectionRangeRect(editor: LexicalEditor): DOMRect | null {
  const selection = $getSelection()
  if (!$isRangeSelection(selection) || selection.isCollapsed() || selection.getTextContent().trim() === '') {
    return null
  }

  const { anchor, focus } = selection
  const domRange = createDOMRange(editor, anchor.getNode(), anchor.offset, focus.getNode(), focus.offset)
  if (domRange === null) {
    return null
  }

  const domRects = createRectsFromDOMRange(editor, domRange)
  if (domRects.length === 0) {
    return null
  }

  let top = domRects[0]!.top
  let left = domRects[0]!.left
  let right = domRects[0]!.right
  let bottom = domRects[0]!.bottom

  for (let i = 1; i < domRects.length; i += 1) {
    const rect = domRects[i]!
    top = Math.min(top, rect.top)
    left = Math.min(left, rect.left)
    right = Math.max(right, rect.right)
    bottom = Math.max(bottom, rect.bottom)
  }

  return new DOMRect(left, top, right - left, bottom - top)
}
