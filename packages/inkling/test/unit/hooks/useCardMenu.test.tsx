import { act, renderHook } from '@testing-library/react'
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  createCommand,
  createEditor,
  type LexicalEditor,
} from 'lexical'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createHostIntegrationValue } from '#/utils/host-integration-context'
import { tick } from '#/utils/test-editor'
import { InklingHostIntegrationProvider } from '@/context/InklingHostIntegrationContext'
import InklingUiPrefsContext from '@/context/InklingUiPrefsContext'
import { useCardMenu } from '@/hooks/useCardMenu'
import { resolveLabels, type InklingLabelsInput } from '@/labels/inkling-labels'
import DEFAULT_NODES from '@/nodes/DefaultNodes'

const INSERT_TEST_COMMAND = createCommand('INSERT_TEST_COMMAND')

function createTestEditor(): LexicalEditor {
  return createEditor({
    namespace: 'test',
    nodes: DEFAULT_NODES,
    onError: () => {},
    theme: {},
  })
}

function createWrapper(cardConfig = {}) {
  const value = createHostIntegrationValue({ cardConfig })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <InklingHostIntegrationProvider value={value}>{children}</InklingHostIntegrationProvider>
  }
}

// the labels seam: prefs context carries the
// composer's merged table; useCardMenu is the single menu-build injection point
function createLabelsWrapper(labels: InklingLabelsInput) {
  const hostValue = createHostIntegrationValue({ cardConfig: {} })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    const prefsValue = React.useMemo(() => ({ darkMode: false, labels: resolveLabels(labels) }), [])
    return (
      <InklingHostIntegrationProvider value={hostValue}>
        <InklingUiPrefsContext.Provider value={prefsValue}>{children}</InklingUiPrefsContext.Provider>
      </InklingHostIntegrationProvider>
    )
  }
}

describe('useCardMenu', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('builds the card menu from the registered card nodes as a flat list', () => {
    const editor = createTestEditor()
    const { result } = renderHook(() => useCardMenu(editor), { wrapper: createWrapper() })

    expect(result.current.cardMenu.items.length).toBeGreaterThan(0)
    expect(result.current.cardMenu.maxItemIndex).toBe(result.current.cardMenu.items.length - 1)
    expect(result.current.cardMenu.items.map((item) => item.label)).toContain('HTML')
    // the flat list is derived from the sections, sharing item identity
    expect(result.current.cardMenu.items).toEqual(result.current.cardMenu.sections.flatMap((section) => section.items))
  })

  it('filters the flat list by query', () => {
    const editor = createTestEditor()
    const { result } = renderHook(() => useCardMenu(editor, 'html'), { wrapper: createWrapper() })

    expect(result.current.cardMenu.items.map((item) => item.label)).toEqual(['HTML'])
  })

  it('adds the Table pseudo entry when the editor registers the table family', () => {
    const editor = createTestEditor()
    const { result } = renderHook(() => useCardMenu(editor, 'table'), { wrapper: createWrapper() })

    expect(result.current.cardMenu.items.map((item) => item.label)).toEqual(['Table'])
  })

  it('omits the Table entry when the table family is not registered', () => {
    const editor = createEditor({
      namespace: 'test',
      nodes: DEFAULT_NODES.filter(
        (entry) =>
          typeof entry !== 'function' ||
          !['table', 'tablerow', 'tablecell'].includes((entry as { getType: () => string }).getType()),
      ),
      onError: () => {},
      theme: {},
    })
    const { result } = renderHook(() => useCardMenu(editor, 'table'), { wrapper: createWrapper() })

    expect(result.current.cardMenu.items.map((item) => item.label)).toEqual([])
  })

  it('resolves menu labels, descs, and section names through the labels table', () => {
    const editor = createTestEditor()
    const { result } = renderHook(() => useCardMenu(editor, 'html'), {
      wrapper: createLabelsWrapper({
        'menu.html.label': '网页',
        'menu.html.desc': '插入 HTML 卡片',
        'menu.section.primary': '主要',
      }),
    })

    expect(result.current.cardMenu.items.map((item) => item.label)).toEqual(['网页'])
    expect(result.current.cardMenu.items[0].desc).toBe('插入 HTML 卡片')
    expect(result.current.cardMenu.sections[0].label).toBe('主要')
  })

  it('keeps the declared aliases for query matching under a labels override', () => {
    const editor = createTestEditor()
    // the override localized the label, but the declared English matches
    // array still drives slash-query matching
    const { result } = renderHook(() => useCardMenu(editor, 'html'), {
      wrapper: createLabelsWrapper({ 'menu.html.label': '网页' }),
    })

    expect(result.current.cardMenu.items.map((item) => item.label)).toEqual(['网页'])
  })

  it('dispatches the insert command with the resolved insertParams as dataset', () => {
    const editor = createTestEditor()
    const dispatchCommandSpy = vi.spyOn(editor, 'dispatchCommand')
    const { result } = renderHook(() => useCardMenu(editor), { wrapper: createWrapper() })

    act(() => {
      result.current.insert(INSERT_TEST_COMMAND, { insertParams: { html: '<p>x</p>' } })
    })

    expect(dispatchCommandSpy).toHaveBeenCalledWith(INSERT_TEST_COMMAND, { html: '<p>x</p>' })
  })

  it('merges typed command params into the dataset under the item queryParams keys', () => {
    const editor = createTestEditor()
    const dispatchCommandSpy = vi.spyOn(editor, 'dispatchCommand')
    const { result } = renderHook(() => useCardMenu(editor, 'image Nature', { commandParams: ['Nature'] }), {
      wrapper: createWrapper(),
    })

    act(() => {
      result.current.insert(INSERT_TEST_COMMAND, { insertParams: { src: 'a.png' }, queryParams: ['tag'] })
    })

    expect(dispatchCommandSpy).toHaveBeenCalledWith(INSERT_TEST_COMMAND, { src: 'a.png', tag: 'Nature' })
  })

  it('passes an empty-string command param through instead of dropping it', () => {
    const editor = createTestEditor()
    const dispatchCommandSpy = vi.spyOn(editor, 'dispatchCommand')
    const { result } = renderHook(() => useCardMenu(editor, 'image', { commandParams: [''] }), {
      wrapper: createWrapper(),
    })

    act(() => {
      result.current.insert(INSERT_TEST_COMMAND, { queryParams: ['tag'] })
    })

    // a typed-but-empty param is a legal value; only `undefined` (no param
    // typed at all) may be skipped
    expect(dispatchCommandSpy).toHaveBeenCalledWith(INSERT_TEST_COMMAND, { tag: '' })
  })

  it('replaces the trigger paragraph before dispatching when replaceTriggerParagraph is set', async () => {
    const editor = createTestEditor()
    const dispatchCommandSpy = vi.spyOn(editor, 'dispatchCommand')

    // discrete so the state is committed synchronously in a root-less editor
    editor.update(
      () => {
        const paragraph = $createParagraphNode()
        paragraph.append($createTextNode('/html'))
        $getRoot().append(paragraph)
        paragraph.select()
      },
      { discrete: true },
    )

    const { result } = renderHook(() => useCardMenu(editor, 'html', { replaceTriggerParagraph: true }), {
      wrapper: createWrapper(),
    })

    await act(async () => {
      result.current.insert(INSERT_TEST_COMMAND, { insertParams: { html: '<p>x</p>' } })
      // the insert's own update is not discrete; let its commit land
      await tick()
    })

    expect(dispatchCommandSpy).toHaveBeenCalledWith(INSERT_TEST_COMMAND, { html: '<p>x</p>' })

    editor.getEditorState().read(() => {
      const paragraph = $getRoot().getFirstChild()
      // the "/html" trigger text is gone; a fresh empty paragraph holds the caret
      expect(paragraph?.getTextContent()).toBe('')
    })
  })
})
