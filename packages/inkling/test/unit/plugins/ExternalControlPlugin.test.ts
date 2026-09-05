import { renderHook } from '@testing-library/react'
import { $createParagraphNode, $createTextNode, $getRoot, createEditor, type LexicalEditor } from 'lexical'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { mockComposerContext } from '#/utils/composer-context'
import { createTestEditor, tick, updateEditor } from '#/utils/test-editor'
import { $createHorizontalRuleNode, HorizontalRuleNode } from '@/nodes/HorizontalRuleNode'
import { ExternalControlPlugin } from '@/plugins/ExternalControlPlugin'

vi.mock('@lexical/react/LexicalComposerContext', () => ({
  useLexicalComposerContext: vi.fn(),
}))

describe('ExternalControlPlugin', () => {
  let editor: LexicalEditor

  beforeEach(() => {
    vi.clearAllMocks()
    editor = createTestEditor({ headless: false })
  })

  it('registers an API object via registerAPI', async () => {
    mockComposerContext(editor)

    const registerAPI = vi.fn()
    renderHook(() => ExternalControlPlugin({ registerAPI }))

    expect(registerAPI).toHaveBeenCalledTimes(1)
    const api = registerAPI.mock.calls[0][0]
    expect(api).toBeTruthy()
    expect(typeof api.serialize).toBe('function')
    expect(typeof api.editorIsEmpty).toBe('function')
    expect(typeof api.focusEditor).toBe('function')
    expect(typeof api.blurEditor).toBe('function')
    expect(typeof api.insertParagraphAtTop).toBe('function')
    expect(typeof api.insertParagraphAtBottom).toBe('function')
    expect(typeof api.insertFiles).toBe('function')
    expect(typeof api.lastNodeIsDecorator).toBe('function')
  })

  it('serializes editor state', async () => {
    mockComposerContext(editor)

    const registerAPI = vi.fn()
    renderHook(() => ExternalControlPlugin({ registerAPI }))
    const api = registerAPI.mock.calls[0][0]

    const json = api.serialize()
    expect(JSON.parse(json)).toHaveProperty('root')
  })

  it('reports editorIsEmpty', async () => {
    mockComposerContext(editor)

    const registerAPI = vi.fn()
    renderHook(() => ExternalControlPlugin({ registerAPI }))
    const api = registerAPI.mock.calls[0][0]

    expect(api.editorIsEmpty()).toBe(true)

    await updateEditor(editor, () => {
      const paragraph = $createParagraphNode()
      paragraph.append($createTextNode('hello'))
      $getRoot().append(paragraph)
    })

    expect(api.editorIsEmpty()).toBe(false)
  })

  it('inserts paragraphs at top and bottom', async () => {
    mockComposerContext(editor)

    const registerAPI = vi.fn()
    renderHook(() => ExternalControlPlugin({ registerAPI }))
    const api = registerAPI.mock.calls[0][0]

    api.insertParagraphAtTop()
    api.insertParagraphAtBottom()

    await tick()

    editor.getEditorState().read(() => {
      expect($getRoot().getChildrenSize()).toBe(2)
    })
  })

  it('passes rootStart default selection to editor.focus for position top', async () => {
    mockComposerContext(editor)

    const registerAPI = vi.fn()
    renderHook(() => ExternalControlPlugin({ registerAPI }))
    const api = registerAPI.mock.calls[0][0]

    const focusSpy = vi.spyOn(editor, 'focus')

    api.focusEditor({ position: 'top' })
    expect(focusSpy).toHaveBeenCalledWith(expect.any(Function), { defaultSelection: 'rootStart' })

    focusSpy.mockClear()
    api.focusEditor({ position: 'bottom' })
    expect(focusSpy).toHaveBeenCalledWith(expect.any(Function), { defaultSelection: undefined })

    focusSpy.mockRestore()
  })

  it('reports lastNodeIsDecorator for decorator nodes', async () => {
    editor = createEditor({ namespace: 'test', nodes: [HorizontalRuleNode], onError: () => {} })
    mockComposerContext(editor)

    const registerAPI = vi.fn()
    renderHook(() => ExternalControlPlugin({ registerAPI }))
    const api = registerAPI.mock.calls[0][0]

    expect(api.lastNodeIsDecorator()).toBe(false)

    await updateEditor(editor, () => {
      $getRoot().append($createHorizontalRuleNode())
    })

    expect(api.lastNodeIsDecorator()).toBe(true)
  })
})
