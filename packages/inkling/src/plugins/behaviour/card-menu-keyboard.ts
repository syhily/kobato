import type { ResolvedMenuItem } from '@kobato/inkling-internal/nodes/cards/card-menu-build'
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

export interface MenuKeyboardPorts {
  isOpen: () => boolean
  moveUp: () => void
  moveDown: () => void

  selectedItem: () => ResolvedMenuItem | undefined
  onSelect: (item: ResolvedMenuItem) => void
}

export function registerMenuKeyboardNavigation(editor: LexicalEditor, ports: MenuKeyboardPorts): () => void {
  const arrow = (move: () => void) => (event: KeyboardEvent) => {
    if (!ports.isOpen()) {
      return false
    }
    move()
    event.preventDefault()
    return true
  }

  const enter = (event: KeyboardEvent | null) => {
    if (!ports.isOpen()) {
      return false
    }
    const item = ports.selectedItem()
    if (item?.insertCommand) {
      ports.onSelect(item)
    }
    event?.preventDefault()
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
