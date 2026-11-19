import type { KeyboardNavigationDeps } from '@kobato/inkling-internal/plugins/behaviour/keyboard-navigation/types'
import type { LexicalEditor } from 'lexical'

import {
  $removeEmptyBlockAndSelectCard,
  $removeLogicallyAdjacentCard,
  dispatchSelectedCardDeletion,
  editorOwnsFocus,
} from '@kobato/inkling-internal/plugins/behaviour/card-adjacency'
import { COMMAND_PRIORITY_LOW, KEY_DELETE_COMMAND } from 'lexical'

export function registerDeleteCommand(editor: LexicalEditor, deps: KeyboardNavigationDeps): () => void {
  const { store, isNested } = deps

  return editor.registerCommand(
    KEY_DELETE_COMMAND,
    (event) => {
      if (!editorOwnsFocus(editor)) {
        return true
      }

      if (dispatchSelectedCardDeletion(editor, store, isNested, 'forward', event)) {
        return true
      }

      if ($removeEmptyBlockAndSelectCard('next', 'from-mode-blank')) {
        event.preventDefault()
        return true
      }

      if ($removeLogicallyAdjacentCard('next')) {
        event.preventDefault()
        return true
      }

      return false
    },
    COMMAND_PRIORITY_LOW,
  )
}
