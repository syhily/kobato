import { createDOMRange, createRectsFromDOMRange } from '@lexical/selection'
import { $isRangeSelection, type BaseSelection, type LexicalEditor } from 'lexical'

export function $getSelectionRangeRect({
  selection,
  editor,
}: {
  selection: BaseSelection | null
  editor: LexicalEditor
}): DOMRect | null {
  if (!selection || !$isRangeSelection(selection)) {
    return null
  }

  const anchor = selection.anchor
  const focus = selection.focus
  const selectionRange = createDOMRange(
    editor,
    anchor.getNode(),
    selection.anchor.offset,
    focus.getNode(),
    selection.focus.offset,
  )

  if (!selectionRange) {
    return null
  }

  const selectionRects = createRectsFromDOMRange(editor, selectionRange)
  const returnRect = selectionRects[0]

  if (!returnRect) {
    return null
  }

  // A selection spanning several lines or containing inline nodes (links) yields several
  // rects.
  if (selectionRects.length > 1) {
    for (let i = 1; i < selectionRects.length; i++) {
      const rect = selectionRects[i]
      if (rect.top === returnRect.top) {
        returnRect.width += rect.width
      }
    }
  }

  return returnRect
}
