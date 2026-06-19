import type { LexicalEditor } from 'lexical'

import { COMMAND_PRIORITY_LOW, KEY_SPACE_COMMAND } from 'lexical'

import { isAnchorAfterCaret } from '@/ui/inkling/editor/shared/dom-selection'

/**
 * Detects `^ ` (caret + space) at cursor and invokes the callback.
 * Returns a cleanup function (Lexical unregister).
 */
export function registerFootnoteCaretTrigger(editor: LexicalEditor, onTrigger: () => void): () => void {
  return editor.registerCommand(
    KEY_SPACE_COMMAND,
    (event: KeyboardEvent) => {
      if (!isAnchorAfterCaret('^')) {
        return false
      }
      event.preventDefault()
      onTrigger()
      return true
    },
    COMMAND_PRIORITY_LOW,
  )
}
