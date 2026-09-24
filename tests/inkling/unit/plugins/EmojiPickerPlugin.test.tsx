import { LexicalComposerContext, createLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { render, renderHook } from '@testing-library/react'
import { SearchIndex } from 'emoji-mart'
import { KEY_DOWN_COMMAND, createEditor } from 'lexical'
import React, { act, useMemo } from 'react'
import { describe, expect, it, vi } from 'vitest'

import type { EmojiSearchResult } from '@/inkling/plugins/behaviour/emoji-completion'

import { EmojiPickerPlugin } from '@/inkling/plugins/EmojiPickerPlugin'

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
  // the index chunk loads lazily on the first typeahead query; its module
  // eval runs emoji-mart's init side effect, and the port's cached promise
  // makes that exactly-once per module registry no matter how many editors
  // mount or queries fire
  it('initializes emoji-mart data once, not per mount', async () => {
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
      // the first query in a test file awaits the emoji-mart chunk import
      // before the search fires — settle it, then flush the search microtasks
      await act(async () => typeaheadCapture.props?.onQueryChange('smi'))
      await act(async () => typeaheadCapture.props?.onQueryChange('smile'))
      await vi.dynamicImportSettled()
      await act(async () => {
        await Promise.resolve()
      })
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
      // a cold file settles the chunk import before the search resolves
      await vi.dynamicImportSettled()
      await act(async () => {
        await Promise.resolve()
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
