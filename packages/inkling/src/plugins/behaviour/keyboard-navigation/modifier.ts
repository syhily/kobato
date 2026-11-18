import type { KeyboardNavigationDeps } from '@kobato/inkling-internal/plugins/behaviour/keyboard-navigation/types'
import type { LexicalEditor } from 'lexical'

import { KEYBOARD_SHORTCUTS } from '@kobato/inkling-internal/plugins/behaviour/keyboard-navigation/shortcuts'
import { COMMAND_PRIORITY_LOW, KEY_DOWN_COMMAND } from 'lexical'

export function registerModifierCommand(editor: LexicalEditor, _deps: KeyboardNavigationDeps): () => void {
  return editor.registerCommand(
    KEY_DOWN_COMMAND,
    (event) => {
      for (const shortcut of KEYBOARD_SHORTCUTS) {
        if (shortcut.matches(event)) {
          return shortcut.run(editor, event)
        }
      }
      return false
    },
    COMMAND_PRIORITY_LOW,
  )
}
