import { createEditor, PASTE_COMMAND, type LexicalEditor } from 'lexical'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ImageNode } from '@/nodes/ImageNode'
import { registerPasteHandler } from '@/plugins/behaviour/registerPasteHandler'

function createTestEditor() {
  return createEditor({
    namespace: 'test',
    nodes: [ImageNode],
    onError: () => {},
  })
}

// jsdom has no ClipboardEvent implementation, so the handler's HTML-paste
// branch (`clipboardEvent instanceof ClipboardEvent`) cannot be reached here;
// that coverage stays with e2e. What is pinned here is the card-input guard:
// pasting while an inner element (e.g. a card input) has focus must be
// swallowed so Lexical's default paste cannot replace the card.
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

    // without a root element the editor is not the paste target, so the
    // guard branch runs and consumes events from form inputs
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
