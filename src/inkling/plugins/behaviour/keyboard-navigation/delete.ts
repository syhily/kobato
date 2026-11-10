import type { LexicalEditor } from 'lexical'

import { COMMAND_PRIORITY_LOW, KEY_DELETE_COMMAND } from 'lexical'

import type { KeyboardNavigationDeps } from '@/inkling/plugins/behaviour/keyboard-navigation/types'

import {
  $removeEmptyBlockAndSelectCard,
  $removeLogicallyAdjacentCard,
  dispatchSelectedCardDeletion,
  editorOwnsFocus,
} from '@/inkling/plugins/behaviour/card-adjacency'

export function registerDeleteCommand(editor: LexicalEditor, deps: KeyboardNavigationDeps): () => void {
  const { store, isNested } = deps

  return editor.registerCommand(
    KEY_DELETE_COMMAND,
    (event) => {
      // Focus is inside an inner element (e.g. a nested editor): swallow the key.
      if (!editorOwnsFocus(editor)) {
        return true
      }

      if (dispatchSelectedCardDeletion(editor, store, isNested, 'forward', event)) {
        return true
      }

      // 'from-mode-blank' keeps the deliberate empty-block check (see EmptyBlockCheck
      // in card-adjacency).
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
