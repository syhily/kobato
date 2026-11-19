import type { KeyboardNavigationDeps } from '@kobato/inkling-internal/plugins/behaviour/keyboard-navigation/types'
import type { LexicalEditor } from 'lexical'

import { focusEditorRoot } from '@kobato/inkling-internal/plugins/behaviour/card-adjacency'
import { SELECT_CARD_COMMAND } from '@kobato/inkling-internal/plugins/behaviour/commands'
import { getParentEditor } from '@kobato/inkling-internal/utils/lexical-internals'
import { COMMAND_PRIORITY_LOW, KEY_ESCAPE_COMMAND } from 'lexical'

export function registerEscapeCommand(editor: LexicalEditor, deps: KeyboardNavigationDeps): () => void {
  const { store } = deps

  return editor.registerCommand(
    KEY_ESCAPE_COMMAND,
    () => {
      const { selectedCardKey, isEditingCard } = store.getState()
      const parentEditor = getParentEditor(editor)
      let handled = false

      if (selectedCardKey && isEditingCard) {
        ;(parentEditor || editor).dispatchCommand(SELECT_CARD_COMMAND, {
          cardKey: selectedCardKey,
        })
        handled = true
      }

      if (parentEditor) {
        focusEditorRoot(parentEditor)
        handled = true
      }

      return handled
    },
    COMMAND_PRIORITY_LOW,
  )
}
