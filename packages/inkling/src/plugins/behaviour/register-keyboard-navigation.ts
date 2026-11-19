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

// ORDER IS LOAD-BEARING: every handler here registers at
// COMMAND_PRIORITY_LOW, and same-priority handlers run in registration
// order. The key-down passthrough must stay first so it can swallow key
// events from card inner elements before any sibling handler sees them
// (pinned by key-down.test.ts). A mis-ordering is a visible diff in this
// table, not a comment violation.
const KEYBOARD_HANDLERS = [
  registerKeyDownPassthrough,
  registerEnterCommand,
  // after enter.ts: it owns the card-selected and cmd/ctrl+enter branches,
  // quote-enter only sees plain enters that fell through
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
