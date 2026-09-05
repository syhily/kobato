import type { LexicalEditor } from 'lexical'

import { COMMAND_PRIORITY_LOW, KEY_DELETE_COMMAND } from 'lexical'

import type { KeyboardNavigationDeps } from './types'

import {
  $removeEmptyBlockAndSelectCard,
  $removeLogicallyAdjacentCard,
  dispatchSelectedCardDeletion,
  editorOwnsFocus,
} from '../card-adjacency'

export function registerDeleteCommand(editor: LexicalEditor, deps: KeyboardNavigationDeps): () => void {
  const { store, isNested } = deps

  return editor.registerCommand(
    KEY_DELETE_COMMAND,
    (event) => {
      // avoid processing card behaviours when an inner element has focus
      if (!editorOwnsFocus(editor)) {
        return true
      }

      // delete selected card if we have one
      if (dispatchSelectedCardDeletion(editor, store, isNested, 'forward', event)) {
        return true
      }

      // handle card selection around card boundaries — the surgeries are the
      // direction-flipped mirrors of backspace's, merged into card-adjacency;
      // 'from-mode-blank' keeps this handler's deliberate empty-block check
      // (see EmptyBlockCheck there)
      if ($removeEmptyBlockAndSelectCard('next', 'from-mode-blank')) {
        event.preventDefault()
        return true
      }

      // delete the next card, keeping selection in place
      if ($removeLogicallyAdjacentCard('next')) {
        event.preventDefault()
        return true
      }

      return false
    },
    COMMAND_PRIORITY_LOW,
  )
}
