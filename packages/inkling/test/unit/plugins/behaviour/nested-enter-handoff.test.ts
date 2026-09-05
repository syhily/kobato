import { COMMAND_PRIORITY_LOW, createEditor, KEY_ENTER_COMMAND, type LexicalCommand, type LexicalEditor } from 'lexical'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { getEventProvenance, registerNestedEnterHandoff } from '@/plugins/behaviour/nested-editor-protocol'
import { getParentEditor } from '@/utils/lexical-internals'

// Unit pins for the shared Enter hand-off both nested-editor surfaces
// (InklingNestedEditorPlugin's default branch, CaptionPlugin) now delegate to.
// These paths previously had e2e coverage only — including the null-event
// (IME/mobile) guard that existed only in the caption copy until the
// consolidation moved it into the protocol module.

// The nested editor is built WITHOUT a parent so Lexical's own command
// propagation up the parent-editor chain can't leak events into the captured
// parent: every event the parent sees here came through the hand-off itself.
function createTestEditor(parentEditor?: LexicalEditor): LexicalEditor {
  return createEditor({
    namespace: 'test',
    onError: () => {},
    parentEditor,
  })
}

function dispatchAndCommit<T>(editor: LexicalEditor, command: LexicalCommand<T>, payload: T): Promise<boolean> {
  return new Promise((resolve) => {
    let result = false
    editor.update(
      () => {
        result = editor.dispatchCommand(command, payload)
      },
      { onUpdate: () => resolve(result) },
    )
  })
}

function enterEvent(init: KeyboardEventInit = {}): KeyboardEvent {
  return new KeyboardEvent('keydown', { key: 'Enter', ...init })
}

function captureParentEnters(parent: LexicalEditor) {
  const listener = vi.fn<(event: KeyboardEvent | null) => boolean>(() => false)
  const unregister = parent.registerCommand(KEY_ENTER_COMMAND, listener, COMMAND_PRIORITY_LOW)
  return { listener, unregister }
}

function openTypeaheadMenu(): void {
  const menu = document.createElement('div')
  menu.id = 'typeahead-menu'
  document.body.appendChild(menu)
}

describe('registerNestedEnterHandoff', () => {
  afterEach(() => {
    document.getElementById('typeahead-menu')?.remove()
  })

  it('hands a plain enter to the parent as a marked event and swallows it', async () => {
    const parent = createTestEditor()
    const nested = createTestEditor()
    const { listener, unregister } = captureParentEnters(parent)
    const cleanup = registerNestedEnterHandoff(nested, parent)

    const event = enterEvent()
    const result = await dispatchAndCommit(nested, KEY_ENTER_COMMAND, event)

    expect(result).toBe(true)
    expect(listener).toHaveBeenCalledTimes(1)
    // the SAME event object crosses the boundary, carrying nested provenance
    expect(listener.mock.calls[0]?.[0]).toBe(event)
    expect(getEventProvenance(event)).toBe('nested-editor')

    cleanup()
    unregister()
  })

  it('resolves the parent lazily when given a resolver (the nested-editor plugin wiring)', async () => {
    const parent = createTestEditor()
    const nested = createTestEditor(parent)
    const { listener, unregister } = captureParentEnters(parent)
    const cleanup = registerNestedEnterHandoff(nested, () => getParentEditor(nested))

    const event = enterEvent()
    const result = await dispatchAndCommit(nested, KEY_ENTER_COMMAND, event)

    expect(result).toBe(true)
    // exactly one delivery: the hand-off's marked dispatch, with Lexical's own
    // parent-chain propagation stopped by the swallow
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener.mock.calls[0]?.[0]).toBe(event)
    expect(getEventProvenance(event)).toBe('nested-editor')

    cleanup()
    unregister()
  })

  it('hands ctrl/cmd+enter to the parent like a plain enter (modifier routing stays in the plugin)', async () => {
    const parent = createTestEditor()
    const nested = createTestEditor()
    const { listener, unregister } = captureParentEnters(parent)
    const cleanup = registerNestedEnterHandoff(nested, parent)

    const event = enterEvent({ metaKey: true })
    const result = await dispatchAndCommit(nested, KEY_ENTER_COMMAND, event)

    expect(result).toBe(true)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(getEventProvenance(event)).toBe('nested-editor')

    cleanup()
    unregister()
  })

  it('lets shift+enter through for a line break', async () => {
    const parent = createTestEditor()
    const nested = createTestEditor()
    const { listener, unregister } = captureParentEnters(parent)
    const cleanup = registerNestedEnterHandoff(nested, parent)

    const event = enterEvent({ shiftKey: true })
    const result = await dispatchAndCommit(nested, KEY_ENTER_COMMAND, event)

    expect(result).toBe(false)
    expect(listener).not.toHaveBeenCalled()
    expect(getEventProvenance(event)).toBeNull()

    cleanup()
    unregister()
  })

  it('lets the null event through (the IME/mobile Enter path)', async () => {
    const parent = createTestEditor()
    const nested = createTestEditor()
    const { listener, unregister } = captureParentEnters(parent)
    const cleanup = registerNestedEnterHandoff(nested, parent)

    const result = await dispatchAndCommit(nested, KEY_ENTER_COMMAND, null)

    expect(result).toBe(false)
    expect(listener).not.toHaveBeenCalled()

    cleanup()
    unregister()
  })

  it('bails out when a typeahead menu is open so the menu can handle Enter itself', async () => {
    const parent = createTestEditor()
    const nested = createTestEditor()
    const { listener, unregister } = captureParentEnters(parent)
    const cleanup = registerNestedEnterHandoff(nested, parent)
    openTypeaheadMenu()

    const event = enterEvent()
    const result = await dispatchAndCommit(nested, KEY_ENTER_COMMAND, event)

    expect(result).toBe(false)
    expect(listener).not.toHaveBeenCalled()
    // a passed-through event is never marked
    expect(getEventProvenance(event)).toBeNull()

    cleanup()
    unregister()
  })

  it('passes through when there is no parent editor', async () => {
    const nested = createTestEditor()
    const cleanup = registerNestedEnterHandoff(nested, () => null)

    const result = await dispatchAndCommit(nested, KEY_ENTER_COMMAND, enterEvent())

    expect(result).toBe(false)

    cleanup()
  })

  it('stops handing off once unregistered', async () => {
    const parent = createTestEditor()
    const nested = createTestEditor()
    const { listener, unregister } = captureParentEnters(parent)
    const cleanup = registerNestedEnterHandoff(nested, parent)

    cleanup()

    const event = enterEvent()
    const result = await dispatchAndCommit(nested, KEY_ENTER_COMMAND, event)

    expect(result).toBe(false)
    expect(listener).not.toHaveBeenCalled()
    expect(getEventProvenance(event)).toBeNull()

    unregister()
  })
})
