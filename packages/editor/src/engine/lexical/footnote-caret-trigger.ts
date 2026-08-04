import type { LexicalEditor } from 'lexical'

import { getFootnoteHandlers } from '@kobato/editor/engine/lexical/footnote-registry'
import { $getSelection, $isRangeSelection, $isTextNode, COMMAND_PRIORITY_EDITOR, KEY_SPACE_COMMAND } from 'lexical'

/**
 * Footnote insert shortcut for the Lexical engine — the port of the
 * tiptap `FootnoteCaretTriggerExtension` input rule (caret + space).
 *
 * The tiptap rule fires when `^ ` (caret followed by ASCII space)
 * completes; on a space keydown we look at the text BEFORE the caret:
 * when it ends with an unescaped `^` (a backslash before it suppresses
 * the trigger), the space is swallowed, the caret deleted, and the
 * footnote insert dialog opens. Disabled inside tables / code blocks —
 * the `canInsertFootnoteMark` equivalent.
 */

const CARET_BEFORE_SPACE_REGEX = /(^|[^\\])\^$/

function $caretAllowsFootnote(): boolean {
  const selection = $getSelection()
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return false
  }
  const anchor = selection.anchor
  if (anchor.type !== 'text') {
    return false
  }
  const node = anchor.getNode()
  const text = node.getTextContent().slice(0, anchor.offset)
  if (!CARET_BEFORE_SPACE_REGEX.test(text)) {
    return false
  }
  // Table / code-block containers ban refs (canInsertFootnoteMark).
  let cursor: import('lexical').LexicalNode | null = node
  while (cursor !== null) {
    const type = cursor.getType()
    if (type === 'tablecell' || type === 'code') {
      return false
    }
    cursor = cursor.getParent()
  }
  return true
}

/** Register the `^ ` footnote trigger (idempotent per editor). */
export function registerFootnoteCaretTrigger(editor: LexicalEditor): () => void {
  return editor.registerCommand(
    KEY_SPACE_COMMAND,
    () => {
      if (!editor.isEditable()) {
        return false
      }
      const allowed = editor.getEditorState().read(() => $caretAllowsFootnote())
      if (!allowed) {
        return false
      }
      // Swallow the space, delete the `^`, open the insert dialog.
      editor.update(() => {
        const selection = $getSelection()
        if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
          return
        }
        const anchor = selection.anchor
        if (anchor.type !== 'text') {
          return
        }
        const node = anchor.getNode()
        if (!$isTextNode(node)) {
          return
        }
        const offset = anchor.offset
        if (offset === 0) {
          return
        }
        const text = node.getTextContent()
        node.setTextContent(text.slice(0, offset - 1) + text.slice(offset))
        node.select(offset - 1, offset - 1)
      })
      getFootnoteHandlers(editor)?.openInsertDialog()
      return true
    },
    COMMAND_PRIORITY_EDITOR,
  )
}
