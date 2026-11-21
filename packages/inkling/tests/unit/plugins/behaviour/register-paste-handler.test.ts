import { ImageNode } from '@kobato/inkling-internal/nodes/ImageNode'
import { registerPasteHandler } from '@kobato/inkling-internal/plugins/behaviour/register-paste-handler'
import { createEditor, PASTE_COMMAND, type LexicalEditor } from 'lexical'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

function createTestEditor() {
  return createEditor({
    namespace: 'test',
    nodes: [ImageNode],
    onError: () => {},
  })
}

describe('registerPasteHandler', () => {
  let editor: LexicalEditor

  beforeEach(() => {
    editor = createTestEditor()
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('registers a paste command listener and returns a cleanup function', () => {
    const cleanup = registerPasteHandler(editor, {})

    expect(typeof cleanup).toBe('function')
    cleanup()
  })

  it('swallows paste events originating from a card input until cleanup', () => {
    const input = document.createElement('input')
    document.body.appendChild(input)
    const cleanup = registerPasteHandler(editor, {})

    const event = { target: input } as unknown as ClipboardEvent
    expect(editor.dispatchCommand(PASTE_COMMAND, event)).toBe(true)

    cleanup()

    expect(editor.dispatchCommand(PASTE_COMMAND, { target: input } as unknown as ClipboardEvent)).toBe(false)
  })

  it('lets paste events from ordinary targets fall through to Lexical', () => {
    const cleanup = registerPasteHandler(editor, {})

    const event = { target: document.body } as unknown as ClipboardEvent
    expect(editor.dispatchCommand(PASTE_COMMAND, event)).toBe(false)

    cleanup()
  })
})
