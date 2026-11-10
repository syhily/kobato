import type { LexicalEditor } from 'lexical'

import { render, renderHook } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { mockComposerContext } from '#/inkling/utils/composer-context'
import {
  cleanupSelectionEditors,
  createSelectionEditor,
  seedSelectionEditor,
  selectFirstText,
} from '#/inkling/utils/selection'
import InklingUiPrefsContext from '@/inkling/context/InklingUiPrefsContext'
import { WordCountHandleContext } from '@/inkling/context/WordCountHandleContext'
import { DEFAULT_LABELS } from '@/inkling/labels/inkling-labels'
import { createWordCountHandle, type WordCountHandle } from '@/inkling/plugins/behaviour/wordCountHandle'
import { WordCountPlugin } from '@/inkling/plugins/WordCountPlugin'
import { countWords } from '@/inkling/utils'

// Smoke suite for the React adapter: handle publish/clear, publisher
// ownership across two plugins, callback replacement, and engine wiring. The
// counting behaviour itself (initial count, incremental flushes, dirty-key
// remapping, nested-editor fallback, focus/editable selection state, detach)
// is pinned headlessly and without wall-clock sleeps in
// behaviour/word-counter.test.ts.

vi.mock('@lexical/react/LexicalComposerContext', () => ({
  useLexicalComposerContext: vi.fn(),
}))
vi.mock('@/inkling/utils', async (importActual) => {
  const actual = await importActual<typeof import('@/inkling/utils')>()
  return { ...actual, countWords: vi.fn(actual.countWords) }
})

function ComposerPrefs({ language, children }: { language?: string; children: React.ReactNode }) {
  const value = React.useMemo(
    () => ({ darkMode: false, labels: DEFAULT_LABELS, wordCountLanguage: language }),
    [language],
  )
  return <InklingUiPrefsContext.Provider value={value}>{children}</InklingUiPrefsContext.Provider>
}

interface RenderPluginOptions {
  onChange?: (count: number) => void
  onSelectionChange?: (count: number | null) => void
  language?: string
  composerLanguage?: string
  editor?: LexicalEditor
}

interface PluginSlot {
  onChange?: (count: number) => void
  onSelectionChange?: (count: number | null) => void
}

describe('WordCountPlugin', () => {
  let editor: LexicalEditor
  const activeElementSpies: Array<{ mockRestore: () => void }> = []

  beforeEach(() => {
    vi.clearAllMocks()
    editor = createSelectionEditor()
  })

  afterEach(() => {
    // restore only the activeElement getters: vi.restoreAllMocks would also
    // reset the module-level countWords spy implementation
    for (const spy of activeElementSpies.splice(0)) {
      spy.mockRestore()
    }
    cleanupSelectionEditors()
  })

  function spyActiveElement(element: Element | null) {
    const spy = vi.spyOn(document, 'activeElement', 'get').mockReturnValue(element)
    activeElementSpies.push(spy)
    return spy
  }

  function pluginWrapper(wordCountHandle: WordCountHandle, composerLanguage?: string) {
    return ({ children }: { children: React.ReactNode }) => (
      <ComposerPrefs language={composerLanguage}>
        <WordCountHandleContext.Provider value={wordCountHandle}>{children}</WordCountHandleContext.Provider>
      </ComposerPrefs>
    )
  }

  function renderPlugin({
    onChange,
    onSelectionChange,
    language,
    composerLanguage,
    editor: pluginEditor = editor,
  }: RenderPluginOptions = {}) {
    mockComposerContext(pluginEditor)
    const wordCountHandle = createWordCountHandle()
    const initialProps: Pick<RenderPluginOptions, 'onChange' | 'onSelectionChange' | 'language'> = {
      onChange,
      onSelectionChange,
      language,
    }
    const result = renderHook(
      (props: Pick<RenderPluginOptions, 'onChange' | 'onSelectionChange' | 'language'>) =>
        WordCountPlugin({ ...props }),
      {
        initialProps,
        wrapper: pluginWrapper(wordCountHandle, composerLanguage),
      },
    )
    return { wordCountHandle, ...result }
  }

  // renderHook discards the callback's return value, so two mounted plugins
  // need a real render; the provider stays identical across rerenders so the
  // handle and its publisher stacks survive.
  function renderPluginSlots(initialProps: { a: PluginSlot | null; b: PluginSlot | null }) {
    mockComposerContext(editor)
    const wordCountHandle = createWordCountHandle()

    function SlotApp({ a, b }: { a: PluginSlot | null; b: PluginSlot | null }) {
      return (
        <>
          {a ? <WordCountPlugin onChange={a.onChange} onSelectionChange={a.onSelectionChange} /> : null}
          {b ? <WordCountPlugin onChange={b.onChange} onSelectionChange={b.onSelectionChange} /> : null}
        </>
      )
    }

    const ui = (props: { a: PluginSlot | null; b: PluginSlot | null }) => (
      <ComposerPrefs>
        <WordCountHandleContext.Provider value={wordCountHandle}>
          <SlotApp {...props} />
        </WordCountHandleContext.Provider>
      </ComposerPrefs>
    )

    const result = render(ui(initialProps))
    return {
      wordCountHandle,
      rerender: (props: { a: PluginSlot | null; b: PluginSlot | null }) => result.rerender(ui(props)),
    }
  }

  it('counts words on mount with an empty editor', () => {
    const onChange = vi.fn()
    renderPlugin({ onChange })
    expect(onChange).toHaveBeenCalledWith(0)
  })

  it('publishes the shared callback on the word-count handle and clears it on unmount', () => {
    const onChange = vi.fn()
    const { unmount, wordCountHandle } = renderPlugin({ onChange })

    // a top-level plugin owns the shared callback so that nested composers can
    // mount their own WordCountPlugin with it
    expect(wordCountHandle.getState().onChange).toBe(onChange)

    unmount()

    expect(wordCountHandle.getState().onChange).toBeNull()
  })

  it('does not publish the shared callback when mounted in a nested editor', () => {
    const topLevelEditor = createSelectionEditor()
    const nestedEditor = createSelectionEditor({ parentEditor: topLevelEditor })

    const onChange = vi.fn()
    const { unmount, wordCountHandle } = renderPlugin({ onChange, editor: nestedEditor })

    // Nested plugins do not own the shared root callback, but still count.
    expect(wordCountHandle.getState().onChange).toBeNull()
    expect(onChange).toHaveBeenCalledWith(0)

    unmount()

    expect(wordCountHandle.getState().onChange).toBeNull()
  })

  it('publishes the language on the word-count handle and clears it on unmount (C7)', () => {
    const onChange = vi.fn()
    const { unmount, wordCountHandle } = renderPlugin({ onChange, language: 'zh' })

    // nested composers read this so their own WordCountPlugin counts with the
    // top-level plugin's language
    expect(wordCountHandle.getState().language).toBe('zh')

    unmount()

    expect(wordCountHandle.getState().language).toBeNull()
  })

  it('keeps the language unset (regex fallback) when neither side names one', () => {
    const onChange = vi.fn()
    const { wordCountHandle } = renderPlugin({ onChange })

    // The host-agnostic contract: no language means countWords' original regex
    // path — never an implicit English Intl.Segmenter.
    expect(wordCountHandle.getState().language).toBeNull()
  })

  it('uses the composer wordCountLanguage when the plugin names none (host locale seam)', () => {
    const onChange = vi.fn()
    const { wordCountHandle, unmount } = renderPlugin({ onChange, composerLanguage: 'zh-CN' })

    // The kobato composer shell passes its active UI locale here; nested
    // composers then read this same value off the handle.
    expect(wordCountHandle.getState().language).toBe('zh-CN')

    unmount()

    expect(wordCountHandle.getState().language).toBeNull()
  })

  it('lets an explicit plugin language win over the composer wordCountLanguage', () => {
    const onChange = vi.fn()
    const { wordCountHandle } = renderPlugin({ onChange, language: 'ja', composerLanguage: 'zh-CN' })

    expect(wordCountHandle.getState().language).toBe('ja')
  })

  it('does nothing when neither callback is supplied', () => {
    const { wordCountHandle } = renderPlugin()

    expect(wordCountHandle.getState()).toEqual({ onChange: null, onSelectionChange: null, language: null })
  })

  it('publishes the selection callback on the handle and emits an initial null', () => {
    const onSelectionChange = vi.fn()
    const { unmount, wordCountHandle } = renderPlugin({ onSelectionChange })

    expect(wordCountHandle.getState()).toEqual({
      onChange: null,
      onSelectionChange,
      language: null,
    })
    expect(onSelectionChange).toHaveBeenCalledTimes(1)
    expect(onSelectionChange).toHaveBeenLastCalledWith(null)

    unmount()

    expect(wordCountHandle.getState()).toEqual({ onChange: null, onSelectionChange: null, language: null })
  })

  it('publishes a selection-only plugin without an onChange channel', () => {
    const onSelectionChange = vi.fn()
    const { wordCountHandle } = renderPlugin({ onSelectionChange })

    expect(wordCountHandle.getState().onChange).toBeNull()
    expect(wordCountHandle.getState().onSelectionChange).toBe(onSelectionChange)
  })

  it('publishes the language for a selection-only plugin', () => {
    const onSelectionChange = vi.fn()
    const { wordCountHandle, unmount } = renderPlugin({ onSelectionChange, composerLanguage: 'zh-CN' })

    expect(wordCountHandle.getState().language).toBe('zh-CN')

    unmount()

    expect(wordCountHandle.getState().language).toBeNull()
  })

  it('mounts and unmounts the document and selection counters independently', async () => {
    await seedSelectionEditor(editor, ['Hello world'])
    spyActiveElement(editor.getRootElement())

    const onChange = vi.fn()
    const onSelectionChange = vi.fn()
    const { wordCountHandle, rerender } = renderPlugin({ onSelectionChange })

    // selection-only: no document pass and no onChange channel
    expect(wordCountHandle.getState().onChange).toBeNull()
    expect(wordCountHandle.getState().onSelectionChange).toBe(onSelectionChange)
    expect(vi.mocked(countWords)).not.toHaveBeenCalled()

    // adding onChange mounts the document counter; selection stays live
    rerender({ onChange, onSelectionChange })
    expect(wordCountHandle.getState().onChange).toBe(onChange)
    expect(onChange).toHaveBeenCalledWith(2)

    // removing onChange unmounts only the document counter
    onChange.mockClear()
    vi.mocked(countWords).mockClear()
    rerender({ onSelectionChange })
    expect(wordCountHandle.getState().onChange).toBeNull()
    await selectFirstText(editor, 0, 5)
    expect(onSelectionChange).toHaveBeenLastCalledWith(1)
    expect(onChange).not.toHaveBeenCalled()
    expect(vi.mocked(countWords)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(countWords).mock.calls[0]?.[0]).toBe('Hello')

    // removing selection returns the plugin to a no-op
    rerender({})
    expect(wordCountHandle.getState()).toEqual({ onChange: null, onSelectionChange: null, language: null })
  })

  it('counts a selection on the real editor and reports its words', async () => {
    await seedSelectionEditor(editor, ['Hello world'])

    const onSelectionChange = vi.fn()
    renderPlugin({ onSelectionChange })
    spyActiveElement(editor.getRootElement())

    await selectFirstText(editor, 0, 5)

    expect(onSelectionChange).toHaveBeenLastCalledWith(1)
  })

  it('does not publish selection state from a nested editor but still reports it', async () => {
    const topLevelEditor = createSelectionEditor()
    const nestedEditor = createSelectionEditor({ parentEditor: topLevelEditor })
    await seedSelectionEditor(nestedEditor, ['Nested caption'])
    await selectFirstText(nestedEditor, 0, 6)

    spyActiveElement(nestedEditor.getRootElement())
    const onSelectionChange = vi.fn()
    const { wordCountHandle } = renderPlugin({ onSelectionChange, editor: nestedEditor })

    // nested counters never own the handle's publish channel…
    expect(wordCountHandle.getState()).toEqual({ onChange: null, onSelectionChange: null, language: null })
    // …but they still count their own non-collapsed selection
    expect(onSelectionChange).toHaveBeenLastCalledWith(1)
  })

  it('counts pre-existing content on mount', async () => {
    await seedSelectionEditor(editor, ['Hello world'])

    const onChange = vi.fn()
    renderPlugin({ onChange })

    expect(onChange).toHaveBeenCalledWith(2)
  })

  it('does not count the full document for a selection-only plugin', async () => {
    await seedSelectionEditor(
      editor,
      Array.from({ length: 40 }, (_, index) => `Paragraph ${index} with several words`),
    )
    spyActiveElement(editor.getRootElement())
    vi.mocked(countWords).mockClear()

    const onSelectionChange = vi.fn()
    renderPlugin({ onSelectionChange })

    // no selection yet: a document pass would have counted every block
    expect(vi.mocked(countWords)).not.toHaveBeenCalled()

    await selectFirstText(editor, 0, 9)
    expect(vi.mocked(countWords)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(countWords).mock.calls[0]?.[0]).toBe('Paragraph')
  })

  it('delivers the current value to a replacement callback', async () => {
    await seedSelectionEditor(editor, ['Hello world'])
    spyActiveElement(editor.getRootElement())

    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = renderPlugin({ onSelectionChange: first })

    await selectFirstText(editor, 0, 5)
    expect(first).toHaveBeenLastCalledWith(1)

    // same value as the previous emission: the new callback still receives it
    rerender({ onSelectionChange: second })
    expect(second).toHaveBeenLastCalledWith(1)
  })

  it('reports new document and selection counts when setLanguage changes segmentation', async () => {
    const cjk = '我今天在家吃了好多好多好吃的现在的我非常开心非常满足'
    await seedSelectionEditor(editor, [cjk])
    spyActiveElement(editor.getRootElement())

    const onChange = vi.fn()
    const onSelectionChange = vi.fn()
    const { rerender } = renderPlugin({ onChange, onSelectionChange })

    await selectFirstText(editor, 0, cjk.length)
    // regex fallback (no language) counts every CJK character
    expect(onChange).toHaveBeenLastCalledWith(cjk.length)
    expect(onSelectionChange).toHaveBeenLastCalledWith(cjk.length)

    // setLanguage keeps counter identity and recounts both channels with the
    // zh segmenter
    rerender({ onChange, onSelectionChange, language: 'zh' })
    expect(onChange).toHaveBeenLastCalledWith(15)
    expect(onSelectionChange).toHaveBeenLastCalledWith(15)
  })

  it('does not recount the document when the selection callback changes', async () => {
    await seedSelectionEditor(
      editor,
      Array.from({ length: 40 }, (_, index) => `Paragraph ${index} with several words`),
    )
    spyActiveElement(editor.getRootElement())

    const onChange = vi.fn()
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = renderPlugin({ onChange, onSelectionChange: first })

    await selectFirstText(editor, 0, 9)
    expect(first).toHaveBeenLastCalledWith(1)
    expect(onChange).toHaveBeenCalledTimes(1)

    vi.mocked(countWords).mockClear()
    rerender({ onChange, onSelectionChange: second })

    // only the selection counter is rebuilt: one countWords call for the
    // selected text, never the 40-block document pass, and no full-count
    // callback
    expect(vi.mocked(countWords)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(countWords).mock.calls[0]?.[0]).toBe('Paragraph')
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenLastCalledWith(1)
  })

  it('keeps onChange and onSelectionChange publishers independent on one editor', () => {
    const onChange = vi.fn()
    const onSelectionChange = vi.fn()
    const { wordCountHandle, rerender } = renderPluginSlots({
      a: { onChange },
      b: { onSelectionChange },
    })
    expect(wordCountHandle.getState().onChange).toBe(onChange)
    expect(wordCountHandle.getState().onSelectionChange).toBe(onSelectionChange)

    rerender({ a: { onChange }, b: null })
    expect(wordCountHandle.getState().onChange).toBe(onChange)
    expect(wordCountHandle.getState().onSelectionChange).toBeNull()

    rerender({ a: null, b: null })
    expect(wordCountHandle.getState().onChange).toBeNull()
  })

  it('does not resurrect A when A unmounts while B remains, then B unmounts', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { wordCountHandle, rerender } = renderPluginSlots({
      a: { onChange: first },
      b: { onChange: second },
    })

    expect(wordCountHandle.getState().onChange).toBe(second)

    rerender({ a: null, b: { onChange: second } })
    expect(wordCountHandle.getState().onChange).toBe(second)

    rerender({ a: null, b: null })
    expect(wordCountHandle.getState().onChange).toBeNull()
  })

  it('restores a still-mounted predecessor: A→B→B cleanup→A cleanup', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { wordCountHandle, rerender } = renderPluginSlots({
      a: { onChange: first },
      b: { onChange: second },
    })

    rerender({ a: { onChange: first }, b: null })
    expect(wordCountHandle.getState().onChange).toBe(first)

    rerender({ a: null, b: null })
    expect(wordCountHandle.getState().onChange).toBeNull()
  })
})
