import type React from 'react'

import { $isLinkNode, LinkNode } from '@lexical/link'
import { act, renderHook } from '@testing-library/react'
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $nodesOfType,
  CONTROLLED_TEXT_INSERTION_COMMAND,
  createEditor,
  type LexicalEditor,
  type LexicalNode,
} from 'lexical'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ListOptionItem, ListOptionSection } from '@/hooks/useSearchLinks'

import { mockComposerContext } from '#/utils/composer-context'
import { tick, updateEditor } from '#/utils/test-editor'
import { InklingHostIntegrationProvider, type CardConfig } from '@/context/InklingHostIntegrationContext'
import { AtLinkNode, AtLinkSearchNode, ZWNJNode } from '@/nodes/base'
import { AtLinkPlugin, InklingAtLinkPlugin } from '@/plugins/AtLinkPlugin'
import trackEvent from '@/utils/analytics'

vi.mock('@lexical/react/LexicalComposerContext', () => ({
  useLexicalComposerContext: vi.fn(),
}))

vi.mock('@/utils/analytics', () => ({
  default: vi.fn(),
}))

// AtLinkPlugin is a pure adapter over src/plugins/behaviour/at-link.ts — the
// removal/normalization/backspace/composition/selection-clamp matrix is
// pinned headlessly in test/unit/plugins/behaviour/at-link.test.ts. This
// suite pins only the gating (searchLinks, registered nodes) and the wiring
// (session snapshot → popup props, popup onSelect → delegated commit +
// analytics).
//
// Harness note: the Portal's children never commit to document.body under
// jsdom + renderHook — true at HEAD too, not a regression — so popup DOM
// behavior stays with e2e (test/e2e/linking.test.ts). The wiring pins read
// the rendered element tree instead: the Portal's AtLinkResultsPopup element
// carries query/listOptions in and delegates onSelect back to the component.

function createTestEditor() {
  return createEditor({
    namespace: 'test',
    nodes: [AtLinkNode, AtLinkSearchNode, ZWNJNode, LinkNode],
    theme: { atLink: 'at-link', atLinkIcon: 'at-link-icon', atLinkSearch: 'at-link-search' },
    onError: () => {},
  })
}

const atLinkContextValue = {
  fileUploader: { useFileUpload: () => ({ upload: vi.fn() }) },
  cardConfig: {},
  darkMode: false,
  enableMultiplayer: false,
  createWebsocketProvider: vi.fn(),
  onError: vi.fn(),
}

const searchLinksContextValue = {
  ...atLinkContextValue,
  cardConfig: { searchLinks: vi.fn() },
}

const contextWrapper = (value: typeof atLinkContextValue) =>
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <InklingHostIntegrationProvider value={value}>{children}</InklingHostIntegrationProvider>
  }

interface PopupProps {
  atLinkNode: LexicalNode
  isSearching?: boolean
  listOptions: ListOptionSection[]
  query?: string
  onSelect: (item?: ListOptionItem) => void
}

// The AtLinkResultsPopup element props carried by the hook's returned Portal
// element, or null while the hook renders nothing.
function popupProps(result: { current: unknown }): PopupProps | null {
  const portal = result.current as React.ReactElement | null
  const popup = (portal?.props as { children?: React.ReactElement } | undefined)?.children
  return (popup?.props as PopupProps | undefined) ?? null
}

describe('AtLinkPlugin', () => {
  let editor: LexicalEditor
  let rootElement: HTMLDivElement

  function mountInklingPlugin(searchLinks: NonNullable<CardConfig['searchLinks']>, siteUrl?: string) {
    mockComposerContext(editor)
    editor.setRootElement(rootElement)
    editor.setEditable(false)
    return renderHook(() => InklingAtLinkPlugin({ searchLinks, siteUrl }))
  }

  async function actFlush() {
    // Lexical 0.46 defers commits (and listener cascades) to microtasks —
    // drain the queue inside act so assertions see the settled state
    await act(async () => {
      await tick()
    })
  }

  async function actUpdate(updateFn: () => void) {
    await act(async () => {
      await updateEditor(editor, updateFn)
    })
    await actFlush()
  }

  async function actDispatch(...args: Parameters<LexicalEditor['dispatchCommand']>) {
    let result = false
    await act(async () => {
      result = editor.dispatchCommand(...args)
    })
    await actFlush()
    return result
  }

  // Focuses an at-link node ('hello ' paragraph, '@' converted, query typed).
  async function buildFocusedAtLink(query: string) {
    await actUpdate(() => {
      const root = $getRoot()
      root.clear()
      const paragraph = $createParagraphNode()
      const text = $createTextNode('hello ')
      paragraph.append(text)
      root.append(paragraph)
      text.select(6, 6)
    })
    expect(await actDispatch(CONTROLLED_TEXT_INSERTION_COMMAND, '@')).toBe(true)
    if (query) {
      await actUpdate(() => {
        const searchNode = $nodesOfType(AtLinkNode)[0].getChildAtIndex(1)
        if (searchNode instanceof AtLinkSearchNode) {
          searchNode.setTextContent(query)
          searchNode.selectEnd()
        }
      })
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    editor = createTestEditor()
    rootElement = document.createElement('div')
    document.body.appendChild(rootElement)
    return () => {
      rootElement.remove()
    }
  })

  it('renders null when searchLinks is not provided', () => {
    mockComposerContext(editor)

    const { result } = renderHook(() => AtLinkPlugin(), {
      wrapper: contextWrapper(atLinkContextValue),
    })
    expect(result.current).toBeNull()
  })

  it('renders null when the at-link nodes are not registered', () => {
    const bareEditor = createEditor({ namespace: 'test', nodes: [], onError: () => {} })
    mockComposerContext(bareEditor)

    const { result } = renderHook(() => AtLinkPlugin(), {
      wrapper: contextWrapper(searchLinksContextValue),
    })
    expect(result.current).toBeNull()
  })

  it('renders the popup while an at-link is focused and closes it when the selection moves away', async () => {
    const { result } = mountInklingPlugin(vi.fn().mockResolvedValue([]))

    await actUpdate(() => {
      const root = $getRoot()
      root.clear()
      const first = $createParagraphNode()
      first.append($createTextNode('hello'))
      const second = $createParagraphNode()
      root.append(first, second)
      second.select(0, 0)
    })
    expect(result.current).toBeNull()

    expect(await actDispatch(CONTROLLED_TEXT_INSERTION_COMMAND, '@')).toBe(true)

    expect(result.current).not.toBeNull()
    expect(popupProps(result)?.query).toBe('')
    expect(popupProps(result)?.atLinkNode.getType()).toBe('at-link')

    await actUpdate(() => {
      const first = $getRoot().getFirstChild()
      if ($isElementNode(first)) {
        first.select(0, 0)
      }
    })

    expect(result.current).toBeNull()
  })

  it('feeds the search results to the popup and commits the selected item as a link', async () => {
    const { result } = mountInklingPlugin(
      vi
        .fn()
        .mockResolvedValue([
          { label: 'Posts', items: [{ title: 'Emoji autocomplete', url: 'https://example.com/emoji' }] },
        ]),
      'https://example.com',
    )

    await buildFocusedAtLink('Emo')
    // wait out the search coordinator's debounce
    await act(async () => {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 200)
      })
    })

    const item = popupProps(result)
      ?.listOptions.flatMap((section) => section.items)
      .find((option) => option.value === 'https://example.com/emoji')
    expect(item).toBeDefined()
    expect(popupProps(result)?.query).toBe('Emo')

    await act(async () => {
      popupProps(result)?.onSelect(item)
    })
    await actFlush()

    editor.getEditorState().read(() => {
      const paragraph = $getRoot().getFirstChild()
      const link = $isElementNode(paragraph) ? paragraph.getChildAtIndex(1) : null
      expect($isLinkNode(link)).toBe(true)
      if ($isLinkNode(link)) {
        expect(link.getURL()).toBe('https://example.com/emoji')
        expect(link.getTextContent()).toBe('Emoji autocomplete')
      }
      // the caret collapsed to the end of the inserted link
      const selection = $getSelection()
      expect($isRangeSelection(selection) && selection.isCollapsed()).toBe(true)
    })
    // analytics is the component's half of the commit (product glue)
    expect(trackEvent).toHaveBeenCalledWith('Link dropdown: Internal link chosen', {
      context: 'at-link',
      fromLatest: false,
      isBookmark: false,
    })
    // the session reset closed the popup
    expect(result.current).toBeNull()
  })

  it('reverts to "@" + query text when the selection has no value', async () => {
    const { result } = mountInklingPlugin(vi.fn().mockResolvedValue([]))

    await buildFocusedAtLink('zz-no-results')
    await act(async () => {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 200)
      })
    })

    expect(popupProps(result)?.listOptions).toEqual([{ label: 'No results found', items: [] }])

    // the no-results option carries a null value: selecting without an item
    // reverts the at-link
    await act(async () => {
      popupProps(result)?.onSelect(undefined)
    })
    await actFlush()

    editor.getEditorState().read(() => {
      const paragraph = $getRoot().getFirstChild()
      // the reverted text merges with the preceding same-format text node
      expect($isElementNode(paragraph) ? paragraph.getTextContent() : null).toBe('hello @zz-no-results')
    })
    expect(result.current).toBeNull()
  })
})
