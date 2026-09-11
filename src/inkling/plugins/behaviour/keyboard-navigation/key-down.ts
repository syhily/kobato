import type { LexicalEditor } from 'lexical'

import { COMMAND_PRIORITY_LOW, KEY_DOWN_COMMAND } from 'lexical'

import type { KeyboardNavigationDeps } from '@/inkling/plugins/behaviour/keyboard-navigation/types'

import { shouldIgnoreEvent } from '@/inkling/utils/shouldIgnoreEvent'

export function registerKeyDownPassthrough(editor: LexicalEditor, _deps: KeyboardNavigationDeps): () => void {
  return editor.registerCommand(
    KEY_DOWN_COMMAND,
    (event) => {
      // Avoid processing custom commands when inside a card's editor.
      // This also prevents Lexical calling event.preventDefault on
      // cut/copy/paste events letting the browser/inner editors do their thing
      if (shouldIgnoreEvent(event)) {
        return true
      }

      return false
    },
    COMMAND_PRIORITY_LOW,
  )
}
