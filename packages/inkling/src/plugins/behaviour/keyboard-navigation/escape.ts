import type { LexicalEditor } from 'lexical'

import { COMMAND_PRIORITY_LOW, KEY_ESCAPE_COMMAND } from 'lexical'

import { getParentEditor } from '@/utils/lexical-internals'

import type { KeyboardNavigationDeps } from './types'

import { focusEditorRoot } from '../card-adjacency'
import { SELECT_CARD_COMMAND } from '../commands'

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

      // only claim the event when something acted so Escape can propagate to
      // lower-priority listeners otherwise
      return handled
    },
    COMMAND_PRIORITY_LOW,
  )
}
