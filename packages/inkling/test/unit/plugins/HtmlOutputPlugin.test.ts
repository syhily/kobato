import { act, renderHook } from '@testing-library/react'
import { $createLineBreakNode, $createParagraphNode, $createTextNode, $getRoot, type LexicalEditor } from 'lexical'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { mockComposerContext } from '#/utils/composer-context'
import { createTestEditor, updateEditor } from '#/utils/test-editor'
import { $createHorizontalRuleNode, HorizontalRuleNode } from '@/nodes/HorizontalRuleNode'
import { HtmlOutputPlugin } from '@/plugins/HtmlOutputPlugin'

vi.mock('@lexical/react/LexicalComposerContext', () => ({
  useLexicalComposerContext: vi.fn(),
}))

describe('HtmlOutputPlugin', () => {
  let editor: LexicalEditor
  let setHtml: (html: string) => void

  beforeEach(async () => {
    vi.clearAllMocks()
    editor = createTestEditor({ headless: false })
    setHtml = vi.fn<(html: string) => void>()

    mockComposerContext(editor)
  })

  it('calls setHtml with the generated HTML when the editor has text', async () => {
    await updateEditor(editor, () => {
      const root = $getRoot()
      root.clear()
      root.append($createParagraphNode().append($createTextNode('hello')))
    })

    const { result } = renderHook(() => HtmlOutputPlugin({ setHtml }))

    await act(async () => {
      ;(result.current as { props: { onChange: () => void } }).props.onChange()
    })

    expect(setHtml).toHaveBeenCalledWith(expect.stringContaining('hello'))
    expect(setHtml).not.toHaveBeenCalledWith('')
  })

  it('calls setHtml with an empty string when the editor is empty', async () => {
    await updateEditor(editor, () => {
      const root = $getRoot()
      root.clear()
      root.append($createParagraphNode().append($createTextNode('remove me')))
    })

    const { result } = renderHook(() => HtmlOutputPlugin({ setHtml }))

    await updateEditor(editor, () => {
      $getRoot().clear()
    })

    await act(async () => {
      ;(result.current as { props: { onChange: () => void } }).props.onChange()
    })

    expect(setHtml).toHaveBeenLastCalledWith('')
  })

  it('calls setHtml with an empty string when the editor only contains an empty paragraph', async () => {
    await updateEditor(editor, () => {
      const root = $getRoot()
      root.clear()
      root.append($createParagraphNode().append($createTextNode('remove me')))
    })

    const { result } = renderHook(() => HtmlOutputPlugin({ setHtml }))

    await updateEditor(editor, () => {
      const root = $getRoot()
      root.clear()
      root.append($createParagraphNode().append($createLineBreakNode()))
    })

    await act(async () => {
      ;(result.current as { props: { onChange: () => void } }).props.onChange()
    })

    expect(setHtml).toHaveBeenLastCalledWith('')
  })

  it('calls setHtml with the card markup when the document only contains a text-less card', async () => {
    // A pure-card document (here a bare horizontal rule) has no root text,
    // but it is not empty — the headless path emits the card markup, so the
    // live export must not collapse it to ''.
    const cardEditor = createTestEditor({ headless: false, nodes: [HorizontalRuleNode] })
    mockComposerContext(cardEditor)

    await updateEditor(cardEditor, () => {
      const root = $getRoot()
      root.clear()
      root.append($createHorizontalRuleNode())
    })

    const { result } = renderHook(() => HtmlOutputPlugin({ setHtml }))

    await act(async () => {
      ;(result.current as { props: { onChange: () => void } }).props.onChange()
    })

    expect(setHtml).toHaveBeenLastCalledWith('<hr>')
  })

  it('debounces rapid changes into a single setHtml call when debounceMs is set', async () => {
    await updateEditor(editor, () => {
      const root = $getRoot()
      root.clear()
      root.append($createParagraphNode().append($createTextNode('hello')))
    })

    vi.useFakeTimers()
    try {
      const { result } = renderHook(() => HtmlOutputPlugin({ setHtml, debounceMs: 100 }))
      const onChange = () => (result.current as { props: { onChange: () => void } }).props.onChange()

      act(() => {
        onChange()
        onChange()
        onChange()
      })

      expect(setHtml).not.toHaveBeenCalled()

      await act(async () => {
        vi.advanceTimersByTime(100)
      })

      expect(setHtml).toHaveBeenCalledTimes(1)
      expect(setHtml).toHaveBeenCalledWith(expect.stringContaining('hello'))
    } finally {
      vi.useRealTimers()
    }
  })
})
