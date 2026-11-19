import {
  getEventProvenance,
  registerCaptionArrowHandoff,
} from '@kobato/inkling-internal/plugins/behaviour/nested-editor-protocol'
import {
  COMMAND_PRIORITY_LOW,
  createEditor,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  type LexicalCommand,
  type LexicalEditor,
} from 'lexical'
import { afterEach, describe, expect, it, vi } from 'vitest'

function createTestEditor(): LexicalEditor {
  return createEditor({ namespace: 'test', onError: () => {} })
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

function openTypeaheadMenu(): void {
  const menu = document.createElement('div')
  menu.id = 'typeahead-menu'
  document.body.appendChild(menu)
}

describe('registerCaptionArrowHandoff', () => {
  afterEach(() => {
    document.getElementById('typeahead-menu')?.remove()
  })

  it.each([
    ['up', KEY_ARROW_UP_COMMAND],
    ['down', KEY_ARROW_DOWN_COMMAND],
  ] as const)('hands arrow %s to the parent as a caption-marked event and swallows it', async (_label, command) => {
    const parent = createTestEditor()
    const caption = createTestEditor()
    const listener = vi.fn<(event: KeyboardEvent | null) => boolean>(() => false)
    const unregister = parent.registerCommand(command, listener, COMMAND_PRIORITY_LOW)
    const cleanup = registerCaptionArrowHandoff(caption, parent)

    const event = new KeyboardEvent('keydown', { key: 'ArrowUp' })
    const result = await dispatchAndCommit(caption, command, event)

    expect(result).toBe(true)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener.mock.calls[0]?.[0]).toBe(event)
    expect(getEventProvenance(event)).toBe('caption-editor')

    cleanup()
    unregister()
  })

  it('bails out when a typeahead menu is open so the menu navigates instead', async () => {
    const parent = createTestEditor()
    const caption = createTestEditor()
    const listener = vi.fn<(event: KeyboardEvent | null) => boolean>(() => false)
    const unregister = parent.registerCommand(KEY_ARROW_UP_COMMAND, listener, COMMAND_PRIORITY_LOW)
    const cleanup = registerCaptionArrowHandoff(caption, parent)

    openTypeaheadMenu()
    const result = await dispatchAndCommit(
      caption,
      KEY_ARROW_UP_COMMAND,
      new KeyboardEvent('keydown', { key: 'ArrowUp' }),
    )

    expect(result).toBe(false)
    expect(listener).not.toHaveBeenCalled()

    cleanup()
    unregister()
  })
})
