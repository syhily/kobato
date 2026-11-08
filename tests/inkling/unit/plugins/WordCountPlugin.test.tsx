import { renderHook } from '@testing-library/react'
import { $createParagraphNode, $createTextNode, $getRoot, createEditor, type LexicalEditor } from 'lexical'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { mockComposerContext } from '#/inkling/utils/composer-context'
import InklingUiPrefsContext from '@/inkling/context/InklingUiPrefsContext'
import { WordCountHandleContext } from '@/inkling/context/WordCountHandleContext'
import { DEFAULT_LABELS } from '@/inkling/labels/inkling-labels'
import { createWordCountHandle } from '@/inkling/plugins/behaviour/wordCountHandle'
import { WordCountPlugin } from '@/inkling/plugins/WordCountPlugin'

// Smoke suite for the React adapter: handle publish/clear and engine wiring.
// The counting behaviour itself (initial count, incremental flushes, dirty-key
// remapping, nested-editor fallback, detach) is pinned headlessly and without
// wall-clock sleeps in test/unit/plugins/behaviour/word-counter.test.ts.

vi.mock('@lexical/react/LexicalComposerContext', () => ({
  useLexicalComposerContext: vi.fn(),
}))

function createTestEditor(overrides: { parentEditor?: LexicalEditor } = {}) {
  const editor = createEditor({
    namespace: 'test',
    onError: () => {},
    parentEditor: overrides.parentEditor,
  })
  editor.setRootElement(document.createElement('div'))
  editor.update(
    () => {
      const root = $getRoot()
      root.clear()
      root.append($createParagraphNode())
    },
    { discrete: true },
  )
  return editor
}

function ComposerPrefs({ language, children }: { language?: string; children: React.ReactNode }) {
  const value = React.useMemo(
    () => ({ darkMode: false, labels: DEFAULT_LABELS, wordCountLanguage: language }),
    [language],
  )
  return <InklingUiPrefsContext.Provider value={value}>{children}</InklingUiPrefsContext.Provider>
}

describe('WordCountPlugin', () => {
  let editor: LexicalEditor

  beforeEach(() => {
    vi.clearAllMocks()
    editor = createTestEditor()
  })

  function renderPlugin(
    onChange?: (count: number) => void,
    pluginEditor = editor,
    language?: string,
    composerLanguage?: string,
  ) {
    mockComposerContext(pluginEditor)

    const wordCountHandle = createWordCountHandle()
    const result = renderHook(() => WordCountPlugin({ onChange, language }), {
      wrapper: ({ children }) => (
        <ComposerPrefs language={composerLanguage}>
          <WordCountHandleContext.Provider value={wordCountHandle}>{children}</WordCountHandleContext.Provider>
        </ComposerPrefs>
      ),
    })
    return { wordCountHandle, ...result }
  }

  it('counts words on mount with an empty editor', () => {
    const onChange = vi.fn()
    renderPlugin(onChange)
    expect(onChange).toHaveBeenCalledWith(0)
  })

  it('publishes the shared callback on the word-count handle and clears it on unmount', () => {
    const onChange = vi.fn()
    const { unmount, wordCountHandle } = renderPlugin(onChange)

    // a top-level plugin owns the shared callback so that nested composers can
    // mount their own WordCountPlugin with it
    expect(wordCountHandle.getState().onChange).toBe(onChange)

    unmount()

    expect(wordCountHandle.getState().onChange).toBeNull()
  })

  it('does not publish the shared callback when mounted in a nested editor', () => {
    const topLevelEditor = createTestEditor()
    const nestedEditor = createTestEditor({ parentEditor: topLevelEditor })

    const onChange = vi.fn()
    const { unmount, wordCountHandle } = renderPlugin(onChange, nestedEditor)

    // Nested plugins do not own the shared root callback, but still count.
    expect(wordCountHandle.getState().onChange).toBeNull()
    expect(onChange).toHaveBeenCalledWith(0)

    unmount()

    expect(wordCountHandle.getState().onChange).toBeNull()
  })

  it('publishes the language on the word-count handle and clears it on unmount (C7)', () => {
    const onChange = vi.fn()
    const { unmount, wordCountHandle } = renderPlugin(onChange, editor, 'zh')

    // nested composers read this so their own WordCountPlugin counts with the
    // top-level plugin's language
    expect(wordCountHandle.getState().language).toBe('zh')

    unmount()

    expect(wordCountHandle.getState().language).toBeNull()
  })

  it('keeps the language unset (regex fallback) when neither side names one', () => {
    const onChange = vi.fn()
    const { wordCountHandle } = renderPlugin(onChange)

    // The host-agnostic contract: no language means countWords' original regex
    // path — never an implicit English Intl.Segmenter.
    expect(wordCountHandle.getState().language).toBeNull()
  })

  it('uses the composer wordCountLanguage when the plugin names none (host locale seam)', () => {
    const onChange = vi.fn()
    const { wordCountHandle, unmount } = renderPlugin(onChange, editor, undefined, 'zh-CN')

    // The kobato composer shell passes its active UI locale here; nested
    // composers then read this same value off the handle.
    expect(wordCountHandle.getState().language).toBe('zh-CN')

    unmount()

    expect(wordCountHandle.getState().language).toBeNull()
  })

  it('lets an explicit plugin language win over the composer wordCountLanguage', () => {
    const onChange = vi.fn()
    const { wordCountHandle } = renderPlugin(onChange, editor, 'ja', 'zh-CN')

    expect(wordCountHandle.getState().language).toBe('ja')
  })

  it('does nothing without an onChange callback', () => {
    const { wordCountHandle } = renderPlugin(undefined)

    expect(wordCountHandle.getState().onChange).toBeNull()
  })

  it('counts pre-existing content on mount', () => {
    editor.update(
      () => {
        const root = $getRoot()
        root.clear()
        root.append($createParagraphNode().append($createTextNode('Hello world')))
      },
      { discrete: true },
    )

    const onChange = vi.fn()
    renderPlugin(onChange)

    expect(onChange).toHaveBeenCalledWith(2)
  })
})
