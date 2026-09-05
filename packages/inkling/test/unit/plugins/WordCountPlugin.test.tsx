import { renderHook } from '@testing-library/react'
import { $createParagraphNode, $createTextNode, $getRoot, createEditor, type LexicalEditor } from 'lexical'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { mockComposerContext } from '#/utils/composer-context'
import { WordCountHandleContext } from '@/context/WordCountHandleContext'
import { createWordCountHandle } from '@/plugins/behaviour/wordCountHandle'
import { WordCountPlugin } from '@/plugins/WordCountPlugin'

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

describe('WordCountPlugin', () => {
  let editor: LexicalEditor

  beforeEach(() => {
    vi.clearAllMocks()
    editor = createTestEditor()
  })

  function renderPlugin(onChange?: (count: number) => void, pluginEditor = editor, language?: string) {
    mockComposerContext(pluginEditor)

    const wordCountHandle = createWordCountHandle()
    const result = renderHook(() => WordCountPlugin({ onChange, language }), {
      wrapper: ({ children }) => (
        <WordCountHandleContext.Provider value={wordCountHandle}>{children}</WordCountHandleContext.Provider>
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

  it('defaults the published language to en', () => {
    const onChange = vi.fn()
    const { wordCountHandle } = renderPlugin(onChange)

    expect(wordCountHandle.getState().language).toBe('en')
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
