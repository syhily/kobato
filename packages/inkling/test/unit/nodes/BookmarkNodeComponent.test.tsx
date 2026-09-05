import { LinkNode } from '@lexical/link'
import { LexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import {
  $isParagraphNode,
  createEditor,
  $getNodeByKey,
  $getRoot,
  KEY_ENTER_COMMAND,
  type LexicalEditor,
  type NodeKey,
} from 'lexical'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createCardSelectionStoreWrapper } from '#/utils/card-selection-store'
import { mockComposerContext } from '#/utils/composer-context'
import { createHostIntegrationValue } from '#/utils/host-integration-context'
import { InklingHostIntegrationProvider, type CardConfig } from '@/context/InklingHostIntegrationContext'
import { BookmarkNode, $createBookmarkNode, $isBookmarkNode } from '@/nodes/BookmarkNode'
import { BookmarkNodeComponent } from '@/nodes/BookmarkNodeComponent'
import trackEvent from '@/utils/analytics'

vi.mock('@/utils/analytics', () => ({
  default: vi.fn(),
}))

vi.mock('@lexical/react/LexicalComposerContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@lexical/react/LexicalComposerContext')>()
  return {
    ...actual,
    useLexicalComposerContext: vi.fn(),
  }
})

vi.mock('../../../src/components/ui/CardCaptionEditor', () => ({
  CardCaptionEditor: () => null,
}))

function createTestEditor(): LexicalEditor {
  const editor = createEditor({ namespace: 'test', nodes: [BookmarkNode, LinkNode], onError: () => {} })
  const rootElement = document.createElement('div')
  editor.setRootElement(rootElement)
  return editor
}

// UrlInputPlugin reads the real composer context (not the mocked hook) to
// register its editor-level Enter handler, so tests that dispatch Enter from
// the editor wrap the component in the real provider
function EditorComposerProvider({ editor, children }: { editor: LexicalEditor; children: React.ReactNode }) {
  const value = React.useMemo<React.ContextType<typeof LexicalComposerContext>>(
    () => [editor, { getTheme: () => null }],
    [editor],
  )
  return <LexicalComposerContext.Provider value={value}>{children}</LexicalComposerContext.Provider>
}

// the store equivalent of the old per-test CardContext factory: the card is
// selected and not editing unless a test says otherwise
function createSelection(
  nodeKey: NodeKey = 'bookmark-1',
  { selected = true, editing = false }: { selected?: boolean; editing?: boolean } = {},
) {
  return createCardSelectionStoreWrapper({
    initialState: { selectedCardKey: selected ? nodeKey : null, isEditingCard: editing },
  })
}

const IMAGE_FILE_TYPES = { image: { mimeTypes: ['image/png'] } }

function addBookmarkNode(editor: LexicalEditor, url: string) {
  return new Promise<NodeKey>((resolve) => {
    editor.update(
      () => {
        const bookmarkNode = $createBookmarkNode({ url })
        $getRoot().append(bookmarkNode)
      },
      { onUpdate: () => resolve(editor.getEditorState().read(() => $getRoot().getFirstChildOrThrow().getKey())) },
    )
  })
}

describe('BookmarkNodeComponent', () => {
  let editor: LexicalEditor

  beforeEach(async () => {
    editor = createTestEditor()
    mockComposerContext(editor)
  })

  it('pastes as link when async metadata fetch fails on init', async () => {
    const fetchEmbed = vi.fn().mockRejectedValue(new Error('Network error'))
    const nodeKey = await addBookmarkNode(editor, 'https://example.com')

    const composerValue = createHostIntegrationValue({ cardConfig: { fetchEmbed }, fileTypes: IMAGE_FILE_TYPES })
    const { wrapper: CardSelectionStoreProvider } = createSelection(nodeKey)

    render(
      <InklingHostIntegrationProvider value={composerValue}>
        <CardSelectionStoreProvider>
          <BookmarkNodeComponent
            captionEditor={null}
            captionEditorInitialState={undefined}
            createdWithUrl={true}
            nodeKey={nodeKey}
            url="https://example.com"
          />
        </CardSelectionStoreProvider>
      </InklingHostIntegrationProvider>,
    )

    await waitFor(() => {
      editor.getEditorState().read(() => {
        const root = $getRoot()
        const paragraph = root.getFirstChild()
        expect($isParagraphNode(paragraph)).toBe(true)
        const link = $isParagraphNode(paragraph) ? paragraph.getFirstChild() : null
        expect(link?.getType()).toBe('link')
        expect(link?.getTextContent()).toBe('https://example.com')
      })
    })
  })

  describe('action toolbar', () => {
    function renderWithToolbar(
      nodeKey: NodeKey,
      selection: { selected?: boolean; editing?: boolean } = {},
      { title = 'Example title', cardConfig = {} }: { title?: string; cardConfig?: CardConfig } = {},
    ) {
      const composerValue = createHostIntegrationValue({ cardConfig, fileTypes: IMAGE_FILE_TYPES })
      const { wrapper: CardSelectionStoreProvider } = createSelection(nodeKey, selection)
      return render(
        <InklingHostIntegrationProvider value={composerValue}>
          <CardSelectionStoreProvider>
            <BookmarkNodeComponent
              captionEditor={null}
              captionEditorInitialState={undefined}
              nodeKey={nodeKey}
              title={title}
              url="https://example.com"
            />
          </CardSelectionStoreProvider>
        </InklingHostIntegrationProvider>,
      )
    }

    function getToolbars(container: HTMLElement) {
      return container.querySelectorAll('[data-inkling-card-toolbar="bookmark"]')
    }

    it('hides the toolbar when the card is not selected', async () => {
      const nodeKey = await addBookmarkNode(editor, 'https://example.com')
      const { container } = renderWithToolbar(nodeKey, { selected: false }, { cardConfig: { createSnippet: vi.fn() } })

      expect(getToolbars(container)).toHaveLength(0)
    })

    it('keeps the toolbar visible while the card is editing', async () => {
      // bookmark's menu toolbar has no !isEditing factor
      const nodeKey = await addBookmarkNode(editor, 'https://example.com')
      const { container } = renderWithToolbar(
        nodeKey,
        { selected: true, editing: true },
        { cardConfig: { createSnippet: vi.fn() } },
      )

      expect(getToolbars(container)).toHaveLength(1)
    })

    it('hides the toolbar until the card has a title', async () => {
      const nodeKey = await addBookmarkNode(editor, 'https://example.com')
      const { container } = renderWithToolbar(
        nodeKey,
        { selected: true },
        { title: '', cardConfig: { createSnippet: vi.fn() } },
      )

      expect(getToolbars(container)).toHaveLength(0)
    })

    it('hides the toolbar when createSnippet is not configured, even with a title', async () => {
      // bookmark is the one card whose toolbar visibility itself gates on
      // createSnippet — it exists solely to offer snippet creation
      const nodeKey = await addBookmarkNode(editor, 'https://example.com')
      const { container } = renderWithToolbar(nodeKey, { selected: true })

      expect(getToolbars(container)).toHaveLength(0)
    })

    it('renders only the snippet item when selected with a title', async () => {
      const nodeKey = await addBookmarkNode(editor, 'https://example.com')
      const { container } = renderWithToolbar(nodeKey, { selected: true }, { cardConfig: { createSnippet: vi.fn() } })

      const toolbars = getToolbars(container)
      expect(toolbars).toHaveLength(1)
      const toolbar = toolbars[0]
      expect(toolbar.querySelectorAll('li')).toHaveLength(1)

      const labels = Array.from(toolbar.querySelectorAll('button')).map((button) => button.getAttribute('aria-label'))
      expect(labels).toEqual(['Save as snippet'])
      expect(toolbar.querySelectorAll('button svg')).toHaveLength(1)
      expect(screen.getByTestId('create-snippet')).toBeTruthy()
    })

    it('swaps the menu toolbar for the snippet input when the snippet item is clicked', async () => {
      const nodeKey = await addBookmarkNode(editor, 'https://example.com')
      const { container } = renderWithToolbar(nodeKey, { selected: true }, { cardConfig: { createSnippet: vi.fn() } })

      fireEvent.click(screen.getByTestId('create-snippet'))

      const toolbars = getToolbars(container)
      expect(toolbars).toHaveLength(1)
      expect(toolbars[0].querySelector('ul')).toBeNull()
      expect(toolbars[0].querySelector('[data-testid="snippet-name"]')).toBeTruthy()
    })
  })

  describe('url submit', () => {
    const embedResponse = {
      url: 'https://example.com/canonical',
      metadata: {
        author: 'Author',
        icon: 'https://example.com/icon.ico',
        title: 'Fetched title',
        description: 'Fetched description',
        publisher: 'Publisher',
        thumbnail: 'https://example.com/thumb.png',
      },
    }

    function renderUrlInput(nodeKey: NodeKey, cardConfig: CardConfig, { withComposer = false } = {}) {
      const composerValue = createHostIntegrationValue({ cardConfig, fileTypes: IMAGE_FILE_TYPES })
      const { wrapper: CardSelectionStoreProvider } = createSelection(nodeKey)
      const component = (
        <InklingHostIntegrationProvider value={composerValue}>
          <CardSelectionStoreProvider>
            <BookmarkNodeComponent
              captionEditor={null}
              captionEditorInitialState={undefined}
              nodeKey={nodeKey}
              url=""
            />
          </CardSelectionStoreProvider>
        </InklingHostIntegrationProvider>
      )
      // UrlInputPlugin reads the real composer context (not the mocked hook)
      // to register its editor-level Enter handler
      if (withComposer) {
        return render(<EditorComposerProvider editor={editor}>{component}</EditorComposerProvider>)
      }
      return render(component)
    }

    function readAppliedBookmark(nodeKey: NodeKey) {
      return editor.getEditorState().read(() => {
        const node = $getNodeByKey(nodeKey)
        return $isBookmarkNode(node) ? { title: node.title, url: node.url } : null
      })
    }

    it('submits the typed URL as a plain string on Enter in the input', async () => {
      const fetchEmbed = vi.fn().mockResolvedValue(embedResponse)
      const nodeKey = await addBookmarkNode(editor, '')
      renderUrlInput(nodeKey, { fetchEmbed })

      fireEvent.change(screen.getByTestId('bookmark-url'), { target: { value: 'https://example.com/page' } })
      fireEvent.keyDown(screen.getByTestId('bookmark-url'), { key: 'Enter' })

      expect(fetchEmbed).toHaveBeenCalledTimes(1)
      expect(fetchEmbed).toHaveBeenCalledWith('https://example.com/page', { type: 'bookmark' })

      await waitFor(() => {
        // the submit path applies the submitted href, not the response's canonical url
        expect(readAppliedBookmark(nodeKey)).toEqual({ title: 'Fetched title', url: 'https://example.com/page' })
      })
    })

    it('submits the input value on Enter dispatched from the main editor', async () => {
      const fetchEmbed = vi.fn().mockResolvedValue(embedResponse)
      const nodeKey = await addBookmarkNode(editor, '')
      renderUrlInput(nodeKey, { fetchEmbed }, { withComposer: true })

      fireEvent.change(screen.getByTestId('bookmark-url'), { target: { value: 'https://example.com/page' } })
      editor.dispatchCommand(KEY_ENTER_COMMAND, new KeyboardEvent('keydown', { key: 'Enter' }))

      expect(fetchEmbed).toHaveBeenCalledTimes(1)
      expect(fetchEmbed).toHaveBeenCalledWith('https://example.com/page', { type: 'bookmark' })

      await waitFor(() => {
        expect(readAppliedBookmark(nodeKey)).toEqual({ title: 'Fetched title', url: 'https://example.com/page' })
      })
    })

    it('submits a dropdown selection with its type', async () => {
      const fetchEmbed = vi.fn().mockResolvedValue(embedResponse)
      const searchLinks = vi
        .fn()
        .mockResolvedValue([{ label: 'Pages', items: [{ title: 'About us', url: 'https://example.com/about' }] }])
      const nodeKey = await addBookmarkNode(editor, '')
      renderUrlInput(nodeKey, { fetchEmbed, searchLinks })

      const input = screen.getByTestId('bookmark-url')
      input.focus()
      await waitFor(() => {
        expect(screen.getByTestId('bookmark-url-listOption')).toBeTruthy()
      })
      // keyboard-select the suggestion: InputList forwards the option's type
      fireEvent.keyDown(input, { key: 'Enter' })

      await waitFor(() => {
        expect(fetchEmbed).toHaveBeenCalledWith('https://example.com/about', { type: 'bookmark' })
      })
      expect(trackEvent).toHaveBeenCalledWith('Link dropdown: Internal link chosen', {
        context: 'bookmark',
        fromLatest: true,
      })
    })
  })
})
