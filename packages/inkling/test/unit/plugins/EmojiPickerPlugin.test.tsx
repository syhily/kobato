import { LexicalComposerContext, createLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { render, renderHook } from '@testing-library/react'
import { SearchIndex } from 'emoji-mart'
import { KEY_DOWN_COMMAND, createEditor } from 'lexical'
import React, { act, useMemo } from 'react'
import { describe, expect, it, vi } from 'vitest'

import type { EmojiSearchResult } from '@/plugins/behaviour/emoji-completion'

import { EmojiPickerPlugin } from '@/plugins/EmojiPickerPlugin'

const emojiMartMocks = vi.hoisted(() => ({
  init: vi.fn(),
}))

vi.mock('emoji-mart', () => ({
  init: emojiMartMocks.init,
  SearchIndex: { search: vi.fn(() => Promise.resolve([])) },
}))

// captures the props the plugin hands to the typeahead so tests can drive
// queries and inspect the offered options without a DOM selection
const typeaheadCapture = vi.hoisted(() => ({
  props: null as {
    onQueryChange: (query: string | null) => void
    options: Array<{ id: string }>
  } | null,
}))

vi.mock('@lexical/react/LexicalTypeaheadMenuPlugin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@lexical/react/LexicalTypeaheadMenuPlugin')>()
  return {
    ...actual,
    LexicalTypeaheadMenuPlugin: (props: {
      onQueryChange: (query: string | null) => void
      options: Array<{ id: string }>
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

// renderHook only invokes the hook function; the typeahead stub must actually
// mount, so the query-flow tests render the plugin as a component instead
function renderPlugin(editor: ReturnType<typeof createTestEditor>) {
  return render(
    <TestWrapper editor={editor}>
      <EmojiPickerPlugin />
    </TestWrapper>,
  )
}

describe('EmojiPickerPlugin', () => {
  // this test must run before any other mount in this file: the init guard is
  // module-scoped, so only the first mount initializes emoji-mart
  it('initializes emoji-mart data once, not per mount', () => {
    const editor = createTestEditor()
    mountPlugin(editor).unmount()
    mountPlugin(editor).unmount()
    expect(emojiMartMocks.init).toHaveBeenCalledTimes(1)
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

  it('applies only the latest query results when searches resolve out of order', async () => {
    const pending = new Map<string, (emojis: EmojiSearchResult[]) => void>()
    const searchMock = vi.mocked(SearchIndex.search)
    searchMock.mockImplementation(
      (query: string) =>
        new Promise<EmojiSearchResult[]>((resolve) => {
          pending.set(query, resolve)
        }),
    )

    try {
      const editor = createTestEditor()
      const { unmount } = renderPlugin(editor)
      act(() => typeaheadCapture.props?.onQueryChange('smi'))
      act(() => typeaheadCapture.props?.onQueryChange('smile'))
      expect(pending.has('smi')).toBe(true)
      expect(pending.has('smile')).toBe(true)

      // the newer query resolves first
      await act(async () => {
        pending.get('smile')?.([{ id: 'smile', skins: [{ native: '😄' }] }])
      })
      expect(typeaheadCapture.props?.options.map((option) => option.id)).toEqual(['smile'])

      // the stale response arrives late and must not overwrite the newer one
      await act(async () => {
        pending.get('smi')?.([{ id: 'smirk', skins: [{ native: '😏' }] }])
      })
      expect(typeaheadCapture.props?.options.map((option) => option.id)).toEqual(['smile'])
      unmount()
    } finally {
      searchMock.mockImplementation(() => Promise.resolve([]))
    }
  })

  it('clears the results when a search rejects instead of rejecting unhandled', async () => {
    const searchMock = vi.mocked(SearchIndex.search)
    const onUnhandled = vi.fn()
    process.on('unhandledRejection', onUnhandled)

    try {
      searchMock.mockResolvedValueOnce([{ id: 'smile', skins: [{ native: '😄' }] }])
      const editor = createTestEditor()
      const { unmount } = renderPlugin(editor)
      await act(async () => {
        typeaheadCapture.props?.onQueryChange('smi')
      })
      expect(typeaheadCapture.props?.options.map((option) => option.id)).toEqual(['smile'])

      searchMock.mockRejectedValueOnce(new Error('search index unavailable'))
      await act(async () => {
        typeaheadCapture.props?.onQueryChange('smile')
      })
      // flush the rejection's microtask chain
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
