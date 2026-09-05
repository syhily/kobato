import { COMMAND_PRIORITY_LOW, createEditor, KEY_DOWN_COMMAND, type LexicalEditor } from 'lexical'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { KeyboardNavigationDeps } from '@/plugins/behaviour/keyboard-navigation/types'

import { createCardSelectionStore } from '@/plugins/behaviour/cardSelectionStore'
import { registerKeyDownPassthrough } from '@/plugins/behaviour/keyboard-navigation/key-down'

const deps: KeyboardNavigationDeps = {
  store: createCardSelectionStore(),
}

function createTestEditor() {
  return createEditor({
    namespace: 'test',
    onError: () => {},
  })
}

function fakeKeyEvent(target: EventTarget | null, key = 'x', metaKey = false): KeyboardEvent {
  return { key, metaKey, target } as unknown as KeyboardEvent
}

describe('registerKeyDownPassthrough', () => {
  let editor: LexicalEditor
  let fallthrough: (event: KeyboardEvent) => boolean

  beforeEach(() => {
    editor = createTestEditor()
    registerKeyDownPassthrough(editor, deps)
    // same-priority listener registered afterwards only runs when the
    // passthrough lets the event through (returns false)
    fallthrough = vi.fn<(event: KeyboardEvent) => boolean>(() => false)
    editor.registerCommand(KEY_DOWN_COMMAND, fallthrough, COMMAND_PRIORITY_LOW)
  })

  it('consumes key events originating from an input inside a card', () => {
    const input = document.createElement('input')
    document.body.appendChild(input)

    editor.dispatchCommand(KEY_DOWN_COMMAND, fakeKeyEvent(input))
    expect(fallthrough).not.toHaveBeenCalled()

    input.remove()
  })

  it('consumes key events originating from a CodeMirror editor', () => {
    const wrapper = document.createElement('div')
    wrapper.className = 'cm-editor'
    const content = document.createElement('div')
    wrapper.appendChild(content)
    document.body.appendChild(wrapper)

    editor.dispatchCommand(KEY_DOWN_COMMAND, fakeKeyEvent(content))
    expect(fallthrough).not.toHaveBeenCalled()

    wrapper.remove()
  })

  it('lets Escape and meta+Enter through so card edit-mode toggling keeps working', () => {
    const input = document.createElement('input')
    document.body.appendChild(input)

    editor.dispatchCommand(KEY_DOWN_COMMAND, fakeKeyEvent(input, 'Escape'))
    editor.dispatchCommand(KEY_DOWN_COMMAND, fakeKeyEvent(input, 'Enter', true))
    expect(fallthrough).toHaveBeenCalledTimes(2)

    input.remove()
  })

  it('lets ordinary editor key events through', () => {
    const div = document.createElement('div')
    document.body.appendChild(div)

    editor.dispatchCommand(KEY_DOWN_COMMAND, fakeKeyEvent(div))
    expect(fallthrough).toHaveBeenCalledTimes(1)

    div.remove()
  })
})
