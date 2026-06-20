import type { LexicalEditor } from 'lexical'

/**
 * Run a synchronous read callback inside the editor's current state and
 * return its result. This is the canonical wrapper for the recurring
 * `let x; editor.getEditorState().read(() => { x = ... }); return x` pattern
 * that appeared 5+ times across the editor (hasFormat, hasLink,
 * shouldShowToolbar, getExistingLink, keyboard-nav selection reads).
 *
 * Every Lexical read MUST happen inside `editor.getEditorState().read(...)`
 * — reading the tree outside a read callback returns stale or null nodes.
 * This helper makes that boundary impossible to forget.
 *
 * The callback runs synchronously (Lexical reads are sync), so the return
 * value is immediately available.
 *
 * @example
 *   const isBold = readEditor(editor, () => {
 *     const sel = $getSelection()
 *     return $isRangeSelection(sel) && sel.hasFormat('bold')
 *   })
 */
export function readEditor<T>(editor: LexicalEditor, fn: () => T): T {
  let result: T
  editor.getEditorState().read(() => {
    result = fn()
  })
  // The read callback runs synchronously, so `result` is always assigned
  // by the time we reach this line.
  return result!
}
