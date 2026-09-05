import {
  createEditor,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_LEFT_COMMAND,
  KEY_ARROW_RIGHT_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_ENTER_COMMAND,
} from 'lexical'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ResolvedMenuItem } from '@/nodes/cards/card-menu-build'

import { registerMenuArrowsClose, registerMenuKeyboardNavigation } from '@/plugins/behaviour/card-menu-keyboard'

// The card menu keyboard policy, driven through a real headless editor: the
// handlers read their inputs at event time through ports, so a dispatched key
// must hit the port exactly when the policy says the menu is open.

const ITEM: ResolvedMenuItem = {
  label: 'Image',
  insertCommand: undefined as never, // replaced per-test when needed
}

function basePorts() {
  return {
    isOpen: vi.fn<() => boolean>(() => true),
    moveUp: vi.fn<() => void>(),
    moveDown: vi.fn<() => void>(),
    selectedItem: vi.fn<() => ResolvedMenuItem | undefined>(() => undefined),
    onSelect: vi.fn<(item: ResolvedMenuItem) => void>(),
    close: vi.fn<() => void>(),
  }
}

describe('registerMenuKeyboardNavigation', () => {
  let editor: ReturnType<typeof createEditor>
  let ports: ReturnType<typeof basePorts>
  let teardown: (() => void) | null = null

  beforeEach(() => {
    editor = createEditor({ onError: () => {} })
    ports = basePorts()
  })

  afterEach(() => {
    teardown?.()
    teardown = null
  })

  function key(command: typeof KEY_ARROW_DOWN_COMMAND, keyName: string): KeyboardEvent {
    // cancelable: true so preventDefault() sets defaultPrevented (jsdom's
    // KeyboardEvent is non-cancelable by default)
    return new KeyboardEvent('keydown', { key: keyName, cancelable: true })
  }

  it('moves the navigator on arrow keys and swallows them while open', () => {
    teardown = registerMenuKeyboardNavigation(editor, ports)

    expect(editor.dispatchCommand(KEY_ARROW_DOWN_COMMAND, key(KEY_ARROW_DOWN_COMMAND, 'ArrowDown'))).toBe(true)
    expect(editor.dispatchCommand(KEY_ARROW_RIGHT_COMMAND, key(KEY_ARROW_RIGHT_COMMAND, 'ArrowRight'))).toBe(true)
    expect(ports.moveDown).toHaveBeenCalledTimes(2)
    expect(ports.moveUp).not.toHaveBeenCalled()

    expect(editor.dispatchCommand(KEY_ARROW_UP_COMMAND, key(KEY_ARROW_UP_COMMAND, 'ArrowUp'))).toBe(true)
    expect(editor.dispatchCommand(KEY_ARROW_LEFT_COMMAND, key(KEY_ARROW_LEFT_COMMAND, 'ArrowLeft'))).toBe(true)
    expect(ports.moveUp).toHaveBeenCalledTimes(2)
  })

  it('inserts the selected item on enter and swallows the key', () => {
    const item: ResolvedMenuItem = { ...ITEM, label: 'Image', insertCommand: { type: 'insert-image' } as never }
    ports.selectedItem.mockReturnValue(item)
    teardown = registerMenuKeyboardNavigation(editor, ports)

    const event = key(KEY_ENTER_COMMAND, 'Enter')
    expect(editor.dispatchCommand(KEY_ENTER_COMMAND, event)).toBe(true)
    expect(ports.onSelect).toHaveBeenCalledWith(item)
    expect(event.defaultPrevented).toBe(true)
  })

  it('swallows enter even when nothing is selected (no onSelect)', () => {
    teardown = registerMenuKeyboardNavigation(editor, ports)

    const event = key(KEY_ENTER_COMMAND, 'Enter')
    expect(editor.dispatchCommand(KEY_ENTER_COMMAND, event)).toBe(true)
    expect(ports.onSelect).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(true)
  })

  it('does not swallow keys when the menu is closed', () => {
    ports.isOpen.mockReturnValue(false)
    teardown = registerMenuKeyboardNavigation(editor, ports)

    const arrow = key(KEY_ARROW_DOWN_COMMAND, 'ArrowDown')
    expect(editor.dispatchCommand(KEY_ARROW_DOWN_COMMAND, arrow)).toBe(false)
    expect(ports.moveDown).not.toHaveBeenCalled()
    expect(arrow.defaultPrevented).toBe(false)

    const enter = key(KEY_ENTER_COMMAND, 'Enter')
    expect(editor.dispatchCommand(KEY_ENTER_COMMAND, enter)).toBe(false)
    expect(ports.onSelect).not.toHaveBeenCalled()
    expect(enter.defaultPrevented).toBe(false)
  })

  it('teardown removes every registration', () => {
    const cleanup = registerMenuKeyboardNavigation(editor, ports)
    cleanup()

    const arrow = key(KEY_ARROW_DOWN_COMMAND, 'ArrowDown')
    expect(editor.dispatchCommand(KEY_ARROW_DOWN_COMMAND, arrow)).toBe(false)
    expect(ports.moveDown).not.toHaveBeenCalled()
  })
})

describe('registerMenuArrowsClose', () => {
  let ports: { isOpen: () => boolean; close: () => void }

  beforeEach(() => {
    ports = { isOpen: () => true, close: vi.fn() }
  })

  it('closes the menu on any arrow key while open', () => {
    const teardown = registerMenuArrowsClose(ports)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }))
    expect(ports.close).toHaveBeenCalledTimes(2)
    teardown()
  })

  it('ignores non-arrow keys and closed menus', () => {
    const teardown = registerMenuArrowsClose(ports)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(ports.close).not.toHaveBeenCalled()

    ports = { isOpen: () => false, close: vi.fn() }
    teardown()
    const teardown2 = registerMenuArrowsClose(ports)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }))
    expect(ports.close).not.toHaveBeenCalled()
    teardown2()
  })

  it('teardown removes the window listener', () => {
    const teardown = registerMenuArrowsClose(ports)
    teardown()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }))
    expect(ports.close).not.toHaveBeenCalled()
  })
})
