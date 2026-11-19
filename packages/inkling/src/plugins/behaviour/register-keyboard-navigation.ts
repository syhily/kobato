import type { KeyboardNavigationDeps } from '@kobato/inkling-internal/plugins/behaviour/keyboard-navigation/types'
import type { LexicalEditor } from 'lexical'

import {
  registerArrowDownCommand,
  registerArrowLeftCommand,
  registerArrowRightCommand,
  registerArrowUpCommand,
} from '@kobato/inkling-internal/plugins/behaviour/keyboard-navigation/arrows'
import { registerBackspaceCommand } from '@kobato/inkling-internal/plugins/behaviour/keyboard-navigation/backspace'
import { registerDeleteCommand } from '@kobato/inkling-internal/plugins/behaviour/keyboard-navigation/delete'
import { registerDeleteLineCommand } from '@kobato/inkling-internal/plugins/behaviour/keyboard-navigation/delete-line'
import { registerEnterCommand } from '@kobato/inkling-internal/plugins/behaviour/keyboard-navigation/enter'
import { registerEscapeCommand } from '@kobato/inkling-internal/plugins/behaviour/keyboard-navigation/escape'
import { registerKeyDownPassthrough } from '@kobato/inkling-internal/plugins/behaviour/keyboard-navigation/key-down'
import { registerModifierCommand } from '@kobato/inkling-internal/plugins/behaviour/keyboard-navigation/modifier'
import { registerQuoteEnterCommand } from '@kobato/inkling-internal/plugins/behaviour/keyboard-navigation/quote-enter'
import { registerTabCommand } from '@kobato/inkling-internal/plugins/behaviour/keyboard-navigation/tab'
import { mergeRegister } from '@lexical/utils'

const KEYBOARD_HANDLERS = [
  registerKeyDownPassthrough,
  registerEnterCommand,
  registerQuoteEnterCommand,
  registerArrowUpCommand,
  registerArrowDownCommand,
  registerArrowLeftCommand,
  registerArrowRightCommand,
  registerModifierCommand,
  registerBackspaceCommand,
  registerDeleteCommand,
  registerDeleteLineCommand,
  registerTabCommand,
  registerEscapeCommand,
] as const

export function registerKeyboardNavigation(editor: LexicalEditor, deps: KeyboardNavigationDeps) {
  return mergeRegister(...KEYBOARD_HANDLERS.map((register) => register(editor, deps)))
}
