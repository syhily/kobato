import type { LexicalEditor } from 'lexical'

import {
  COMMAND_PRIORITY_HIGH,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_LEFT_COMMAND,
  KEY_ARROW_RIGHT_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_ENTER_COMMAND,
  mergeRegister,
} from 'lexical'

import type { ResolvedMenuItem } from '@/nodes/cards/card-menu-build'

// The card menu's keyboard policy, headless — the mapping from keys to menu
// actions the popup used to own inline. Two syntaxes, one module:
// - the slash trigger navigates the menu (arrows) and inserts the selected
//   item (Enter), through the menu navigator (createMenuNavigator);
// - the button trigger closes the menu on any arrow (the caret is left alone;
//   Escape and outside-mousedown stay owned by the session).
// Registration happens once per editor and reads its inputs at EVENT time
// through ports (the card-interaction precedent), so the popup mounts the
// registration while the menu is open instead of re-registering per render.

export interface MenuKeyboardPorts {
  /** The menu is open at event time (the registration may outlive a close). */
  isOpen: () => boolean
  /** Move the navigator selection (wrap-around index). */
  moveUp: () => void
  /** Move the navigator selection (wrap-around index). */
  moveDown: () => void
  /** The currently selected item, or undefined. */
  selectedItem: () => ResolvedMenuItem | undefined
  /** Enter on the selected item: insert it and report analytics. */
  onSelect: (item: ResolvedMenuItem) => void
}

/**
 * The slash syntax's arrow/enter navigation. Registered while the slash menu
 * is open; the handlers swallow the key (preventDefault + true) whenever the
 * menu is open, even when nothing is selected.
 */
export function registerMenuKeyboardNavigation(editor: LexicalEditor, ports: MenuKeyboardPorts): () => void {
  const arrow = (move: () => void) => (event: KeyboardEvent) => {
    if (!ports.isOpen()) {
      return false
    }
    move()
    event.preventDefault()
    return true
  }

  const enter = (event: KeyboardEvent) => {
    if (!ports.isOpen()) {
      return false
    }
    const item = ports.selectedItem()
    if (item?.insertCommand) {
      ports.onSelect(item)
    }
    event.preventDefault()
    return true
  }

  return mergeRegister(
    editor.registerCommand(KEY_ARROW_DOWN_COMMAND, arrow(ports.moveDown), COMMAND_PRIORITY_HIGH),
    editor.registerCommand(KEY_ARROW_UP_COMMAND, arrow(ports.moveUp), COMMAND_PRIORITY_HIGH),
    editor.registerCommand(KEY_ARROW_RIGHT_COMMAND, arrow(ports.moveDown), COMMAND_PRIORITY_HIGH),
    editor.registerCommand(KEY_ARROW_LEFT_COMMAND, arrow(ports.moveUp), COMMAND_PRIORITY_HIGH),
    editor.registerCommand(KEY_ENTER_COMMAND, enter, COMMAND_PRIORITY_HIGH),
  )
}

/**
 * The button syntax's arrows-close: a window-level keydown (the editor's own
 * arrow commands belong to the slash syntax) that closes the menu without
 * touching the caret. Registered while the button menu is open.
 */
export function registerMenuArrowsClose(ports: { isOpen: () => boolean; close: () => void }): () => void {
  const handleKeydown = (event: KeyboardEvent) => {
    if (!ports.isOpen()) {
      return
    }
    const arrowKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']
    if (arrowKeys.includes(event.key)) {
      ports.close()
    }
  }

  window.addEventListener('keydown', handleKeydown)
  return () => {
    window.removeEventListener('keydown', handleKeydown)
  }
}
