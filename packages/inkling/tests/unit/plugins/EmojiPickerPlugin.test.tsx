import type { EmojiSearchResult } from '@kobato/inkling-internal/plugins/behaviour/emoji-completion'
import type { EmojiLocale } from '@kobato/inkling-internal/plugins/behaviour/emoji-search-index'

import InklingUiPrefsContext from '@kobato/inkling-internal/context/InklingUiPrefsContext'
import { DEFAULT_LABELS } from '@kobato/inkling-internal/labels/inkling-labels'
import { EmojiPickerPlugin } from '@kobato/inkling-internal/plugins/EmojiPickerPlugin'
import { LexicalComposerContext, createLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { render, renderHook } from '@testing-library/react'
import { KEY_DOWN_COMMAND, createEditor } from 'lexical'
import React, { act, useMemo } from 'react'
import { describe, expect, it, vi } from 'vitest'

const searchIndexMocks = vi.hoisted(() => ({
  searchEmojiDataset: vi.fn<(query: string, locale?: EmojiLocale) => Promise<readonly EmojiSearchResult[]>>(() =>
    Promise.resolve([]),
  ),
}))

vi.mock('@kobato/inkling-internal/plugins/behaviour/emoji-search-index', () => ({
  searchEmojiDataset: searchIndexMocks.searchEmojiDataset,
}))

const typeaheadCapture = vi.hoisted(() => ({
  props: null as {
    onQueryChange: (query: string | null) => void
    options: Array<{ key: string }>
  } | null,
}))

vi.mock('@lexical/react/LexicalTypeaheadMenuPlugin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@lexical/react/LexicalTypeaheadMenuPlugin')>()
  return {
    ...actual,
    LexicalTypeaheadMenuPlugin: (props: {
      onQueryChange: (query: string | null) => void
      options: Array<{ key: string }>
    }) => {
      typeaheadCapture.props = props
      return null
    },
  }
})

function createTestEditor() {
  return createEditor({
    namespace: 'test',
    nodes: [],
    onError: () => {},
    theme: {},
  })
}

function TestWrapper({ children, editor }: { children: React.ReactNode; editor: ReturnType<typeof createTestEditor> }) {
  const contextValue = useMemo<React.ContextType<typeof LexicalComposerContext>>(
    () => [editor, createLexicalComposerContext(null, {})],
    [editor],
  )
  return <LexicalComposerContext.Provider value={contextValue}>{children}</LexicalComposerContext.Provider>
}

function mountPlugin(editor: ReturnType<typeof createTestEditor>) {
  return renderHook(() => EmojiPickerPlugin(), {
    wrapper: ({ children }: { children: React.ReactNode }) => <TestWrapper editor={editor}>{children}</TestWrapper>,
  })
}

function renderPlugin(editor: ReturnType<typeof createTestEditor>) {
  return render(
    <TestWrapper editor={editor}>
      <EmojiPickerPlugin />
    </TestWrapper>,
  )
}

function ComposerPrefs({ emojiLocale, children }: { emojiLocale: EmojiLocale; children: React.ReactNode }) {
  const value = React.useMemo(() => ({ darkMode: false, labels: DEFAULT_LABELS, emojiLocale }), [emojiLocale])
  return <InklingUiPrefsContext.Provider value={value}>{children}</InklingUiPrefsContext.Provider>
}

function renderPluginWithPrefs(editor: ReturnType<typeof createTestEditor>, emojiLocale: EmojiLocale) {
  return render(
    <TestWrapper editor={editor}>
      <ComposerPrefs emojiLocale={emojiLocale}>
        <EmojiPickerPlugin />
      </ComposerPrefs>
    </TestWrapper>,
  )
}

function grinningFixture(): EmojiSearchResult {
  return { unified: '1f600', emoji: '😀', names: ['grin', 'smile', 'grinning face'], addedIn: '1' }
}

describe('EmojiPickerPlugin', () => {
  it('loads the lazy search chunk once, not per mount', async () => {
    const editor = createTestEditor()
    const first = renderPlugin(editor)
    await act(async () => {
      typeaheadCapture.props?.onQueryChange('smi')
    })
    await vi.dynamicImportSettled()
    first.unmount()

    const second = renderPlugin(editor)
    await act(async () => {
      typeaheadCapture.props?.onQueryChange('smi')
    })
    await vi.dynamicImportSettled()
    second.unmount()

    expect(searchIndexMocks.searchEmojiDataset).toHaveBeenCalledTimes(2)
    expect(searchIndexMocks.searchEmojiDataset).toHaveBeenLastCalledWith('smi', undefined)
  })

  it('registers the KEY_DOWN_COMMAND listener once and does not re-register on re-render', () => {
    const editor = createTestEditor()
    const registerSpy = vi.spyOn(editor, 'registerCommand')
    const { rerender, unmount } = mountPlugin(editor)
    rerender()
    rerender()
    const keyDownRegistrations = registerSpy.mock.calls.filter(([command]) => command === KEY_DOWN_COMMAND)
    expect(keyDownRegistrations).toHaveLength(1)
    unmount()
    registerSpy.mockRestore()
  })

  it('searches with the locale provided by the UI-prefs context', async () => {
    const editor = createTestEditor()
    const { unmount } = renderPluginWithPrefs(editor, 'zh')
    await act(async () => {
      typeaheadCapture.props?.onQueryChange('smi')
    })
    await vi.dynamicImportSettled()
    await act(async () => {
      await Promise.resolve()
    })

    expect(searchIndexMocks.searchEmojiDataset).toHaveBeenCalledWith('smi', 'zh')
    unmount()
  })

  it('re-registers the exact-match completion only when the context locale changes', () => {
    const editor = createTestEditor()
    const registerSpy = vi.spyOn(editor, 'registerCommand')
    const tree = (emojiLocale: EmojiLocale) => (
      <TestWrapper editor={editor}>
        <ComposerPrefs emojiLocale={emojiLocale}>
          <EmojiPickerPlugin />
        </ComposerPrefs>
      </TestWrapper>
    )
    const { rerender, unmount } = render(tree('zh'))
    rerender(tree('zh'))
    const countRegistrations = () => registerSpy.mock.calls.filter(([command]) => command === KEY_DOWN_COMMAND).length
    expect(countRegistrations()).toBe(1)

    rerender(tree('zh-hant'))
    expect(countRegistrations()).toBe(2)
    unmount()
    registerSpy.mockRestore()
  })

  it('applies only the latest query results when searches resolve out of order', async () => {
    const pending = new Map<string, (emojis: EmojiSearchResult[]) => void>()
    const searchMock = vi.mocked(searchIndexMocks.searchEmojiDataset)
    searchMock.mockImplementation(
      (query: string) =>
        new Promise<EmojiSearchResult[]>((resolve) => {
          pending.set(query, resolve)
        }),
    )

    try {
      const editor = createTestEditor()
      const { unmount } = renderPlugin(editor)
      await act(async () => typeaheadCapture.props?.onQueryChange('smi'))
      await act(async () => typeaheadCapture.props?.onQueryChange('smile'))
      await vi.dynamicImportSettled()
      await act(async () => {
        await Promise.resolve()
      })
      expect(pending.has('smi')).toBe(true)
      expect(pending.has('smile')).toBe(true)

      await act(async () => {
        pending.get('smile')?.([grinningFixture()])
      })
      expect(typeaheadCapture.props?.options.map((option) => option.key)).toEqual(['1f600'])

      await act(async () => {
        pending.get('smi')?.([{ unified: '1f604', emoji: '😄', names: ['smiling'], addedIn: '0.6' }])
      })
      expect(typeaheadCapture.props?.options.map((option) => option.key)).toEqual(['1f600'])
      unmount()
    } finally {
      searchMock.mockImplementation(() => Promise.resolve([]))
    }
  })

  it('clears the results when a search rejects instead of rejecting unhandled', async () => {
    const searchMock = vi.mocked(searchIndexMocks.searchEmojiDataset)
    const onUnhandled = vi.fn()
    process.on('unhandledRejection', onUnhandled)

    try {
      searchMock.mockResolvedValueOnce([grinningFixture()])
      const editor = createTestEditor()
      const { unmount } = renderPlugin(editor)
      await act(async () => {
        typeaheadCapture.props?.onQueryChange('smi')
      })
      await vi.dynamicImportSettled()
      await act(async () => {
        await Promise.resolve()
      })
      expect(typeaheadCapture.props?.options.map((option) => option.key)).toEqual(['1f600'])

      searchMock.mockRejectedValueOnce(new Error('search index unavailable'))
      await act(async () => {
        typeaheadCapture.props?.onQueryChange('smile')
      })
      await act(async () => {
        await Promise.resolve()
      })
      expect(typeaheadCapture.props?.options).toEqual([])
      expect(onUnhandled).not.toHaveBeenCalled()
      unmount()
    } finally {
      process.off('unhandledRejection', onUnhandled)
      searchMock.mockImplementation(() => Promise.resolve([]))
    }
  })
})
