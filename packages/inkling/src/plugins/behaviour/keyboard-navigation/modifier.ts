import type { LexicalEditor } from 'lexical'

import { COMMAND_PRIORITY_LOW, KEY_DOWN_COMMAND } from 'lexical'

import type { KeyboardNavigationDeps } from './types'

import { MODIFIER_SHORTCUTS } from './shortcuts'

export function registerModifierCommand(editor: LexicalEditor, _deps: KeyboardNavigationDeps): () => void {
  return editor.registerCommand(
    KEY_DOWN_COMMAND,
    (event) => {
      for (const shortcut of MODIFIER_SHORTCUTS) {
        if (shortcut.matches(event)) {
          return shortcut.run(editor, event)
        }
      }
      return false
    },
    COMMAND_PRIORITY_LOW,
  )
}
