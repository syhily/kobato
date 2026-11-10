import type { LexicalEditor } from 'lexical'

import { COMMAND_PRIORITY_LOW, KEY_DOWN_COMMAND } from 'lexical'

import type { KeyboardNavigationDeps } from '@/inkling/plugins/behaviour/keyboard-navigation/types'

import { shouldIgnoreEvent } from '@/inkling/utils/shouldIgnoreEvent'

export function registerKeyDownPassthrough(editor: LexicalEditor, _deps: KeyboardNavigationDeps): () => void {
  return editor.registerCommand(
    KEY_DOWN_COMMAND,
    (event) => {
      // Swallow keys inside a card's editor; this also stops Lexical calling
      // preventDefault on cut/copy/paste, letting the browser or inner editor act.
      if (shouldIgnoreEvent(event)) {
        return true
      }

      return false
    },
    COMMAND_PRIORITY_LOW,
  )
}
