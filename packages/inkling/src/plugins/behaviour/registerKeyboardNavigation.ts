import type { LexicalEditor } from 'lexical'

import { mergeRegister } from '@lexical/utils'

import type { KeyboardNavigationDeps } from './keyboard-navigation/types'

import {
  registerArrowDownCommand,
  registerArrowLeftCommand,
  registerArrowRightCommand,
  registerArrowUpCommand,
} from './keyboard-navigation/arrows'
import { registerBackspaceCommand } from './keyboard-navigation/backspace'
import { registerDeleteCommand } from './keyboard-navigation/delete'
import { registerDeleteLineCommand } from './keyboard-navigation/delete-line'
import { registerEnterCommand } from './keyboard-navigation/enter'
import { registerEscapeCommand } from './keyboard-navigation/escape'
import { registerKeyDownPassthrough } from './keyboard-navigation/key-down'
import { registerModifierCommand } from './keyboard-navigation/modifier'
import { registerTabCommand } from './keyboard-navigation/tab'

// ORDER IS LOAD-BEARING: every handler here registers at
// COMMAND_PRIORITY_LOW, and same-priority handlers run in registration
// order. The key-down passthrough must stay first so it can swallow key
// events from card inner elements before any sibling handler sees them
// (pinned by key-down.test.ts). The table IS the order — a mis-ordering is
// a visible diff, not a comment violation (the MODIFIER_SHORTCUTS shape in
// shortcuts.ts is the precedent).
const KEYBOARD_HANDLERS = [
  registerKeyDownPassthrough,
  registerEnterCommand,
  registerArrowUpCommand,
  registerArrowDownCommand,
  registerArrowLeftCommand,
  registerArrowRightCommand,
  registerModifierCommand,
  // backspace when card isn't selected
  registerBackspaceCommand,
  registerDeleteCommand,
  registerDeleteLineCommand,
  registerTabCommand,
  registerEscapeCommand,
] as const

export function registerKeyboardNavigation(editor: LexicalEditor, deps: KeyboardNavigationDeps) {
  return mergeRegister(...KEYBOARD_HANDLERS.map((register) => register(editor, deps)))
}
