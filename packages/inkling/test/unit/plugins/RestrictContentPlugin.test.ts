import { renderHook } from '@testing-library/react'
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  COMMAND_PRIORITY_LOW,
  PASTE_COMMAND,
  type LexicalEditor,
} from 'lexical'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { mockComposerContext } from '#/utils/composer-context'
import { createTestEditor, updateEditor } from '#/utils/test-editor'
import { MIME_TEXT_HTML, MIME_TEXT_PLAIN, PASTE_MARKDOWN_COMMAND } from '@/plugins/behaviour/clipboard-protocol'
import { RestrictContentPlugin } from '@/plugins/RestrictContentPlugin'

vi.mock('@lexical/react/LexicalComposerContext', () => ({
  useLexicalComposerContext: vi.fn(),
}))

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('RestrictContentPlugin', () => {
  let editor: LexicalEditor

  beforeEach(() => {
    vi.clearAllMocks()
    editor = createTestEditor({ headless: false })
  })

  it('mount smoke: the registered transform applies the restriction on update', async () => {
    mockComposerContext(editor)

    renderHook(() => RestrictContentPlugin({ paragraphs: 2 }))

    await updateEditor(editor, () => {
      const root = $getRoot()
      root.clear()
      root.append($createParagraphNode().append($createTextNode('one')))
      root.append($createParagraphNode().append($createTextNode('two')))
      root.append($createParagraphNode().append($createTextNode('three')))
      root.selectEnd()
    })

    editor.getEditorState().read(() => {
      expect($getRoot().getChildrenSize()).toBe(2)
    })
  })

  it('calls preventDefault on the plain-text markdown paste path', async () => {
    mockComposerContext(editor)

    renderHook(() => RestrictContentPlugin({ paragraphs: 2 }))

    // jsdom has no ClipboardEvent implementation and the plugin's PASTE
    // listener narrows PasteCommandType with an instanceof guard, so stub
    // the global to let the dispatched payload through (same documented
    // limitation as test/unit/plugins/behaviour/at-link.test.ts)
    vi.stubGlobal('ClipboardEvent', class extends Event {})

    const preventDefault = vi.fn()
    const clipboardData = {
      getData: (mime: string) => (mime === MIME_TEXT_PLAIN ? 'hello world' : mime === MIME_TEXT_HTML ? '' : ''),
    } as DataTransfer

    const event = new ClipboardEvent('paste')
    Object.defineProperty(event, 'clipboardData', { value: clipboardData })
    Object.defineProperty(event, 'preventDefault', { value: preventDefault })

    const handled = editor.dispatchCommand(PASTE_COMMAND, event)

    expect(handled).toBe(true)
    expect(preventDefault).toHaveBeenCalled()
  })

  it('wins over an earlier-registered low-priority general paste handler', () => {
    // InklingBehaviourPlugin mounts before RestrictContentPlugin in
    // InklingComposableEditor and registers the general plain-text paste
    // handler at COMMAND_PRIORITY_LOW. Same-priority listeners run in
    // registration order, so without a higher priority the restriction would
    // never see the paste and the general handler's allowBr: true would leak
    // <br> into restricted editors (e2e: pasting plain text keeps one
    // flattened paragraph).
    const generalHandler = vi.fn(() => true)
    editor.registerCommand(PASTE_COMMAND, generalHandler, COMMAND_PRIORITY_LOW)

    mockComposerContext(editor)

    renderHook(() => RestrictContentPlugin({ paragraphs: 1 }))

    const markdownPayloads: Array<{ text: string; allowBr: boolean }> = []
    editor.registerCommand(
      PASTE_MARKDOWN_COMMAND,
      (payload) => {
        markdownPayloads.push(payload)
        return true
      },
      COMMAND_PRIORITY_LOW,
    )

    // jsdom has no ClipboardEvent implementation; see the plain-text paste
    // test above for the stub rationale.
    vi.stubGlobal('ClipboardEvent', class extends Event {})

    const event = new ClipboardEvent('paste')
    Object.defineProperty(event, 'clipboardData', {
      value: {
        getData: (mime: string) => (mime === MIME_TEXT_PLAIN ? 'hello world' : ''),
        types: [MIME_TEXT_PLAIN],
      },
    })

    const handled = editor.dispatchCommand(PASTE_COMMAND, event)

    expect(handled).toBe(true)
    expect(generalHandler).not.toHaveBeenCalled()
    expect(markdownPayloads).toEqual([{ text: 'hello world', allowBr: false }])
  })
})
