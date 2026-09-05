import { fireEvent, render, screen } from '@testing-library/react'
import { $getRoot, type LexicalEditor, type NodeKey } from 'lexical'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createCardSelectionStoreWrapper } from '#/utils/card-selection-store'
import { mockComposerContext } from '#/utils/composer-context'
import { createHostIntegrationValue } from '#/utils/host-integration-context'
import { createTestEditor } from '#/utils/test-editor'
import { InklingHostIntegrationProvider, type CardConfig } from '@/context/InklingHostIntegrationContext'
import { HtmlNode } from '@/nodes/HtmlNode'
import { HtmlNodeComponent } from '@/nodes/HtmlNodeComponent'
import { EDIT_CARD_COMMAND } from '@/plugins/behaviour/commands'

vi.mock('@lexical/react/LexicalComposerContext', () => ({
  useLexicalComposerContext: vi.fn(),
}))

// the store equivalent of the old per-test CardContext factory: the card is
// selected and not editing unless a test says otherwise
function createSelection(
  nodeKey: NodeKey = 'html-1',
  { selected = true, editing = false }: { selected?: boolean; editing?: boolean } = {},
) {
  return createCardSelectionStoreWrapper({
    initialState: { selectedCardKey: selected ? nodeKey : null, isEditingCard: editing },
  })
}

function addHtmlNode(editor: LexicalEditor) {
  return new Promise<NodeKey>((resolve) => {
    editor.update(
      () => {
        const htmlNode = new HtmlNode({ html: '<p>Hello</p>' })
        $getRoot().append(htmlNode)
      },
      { onUpdate: () => resolve(editor.getEditorState().read(() => $getRoot().getFirstChildOrThrow().getKey())) },
    )
  })
}

describe('HtmlNodeComponent', () => {
  let editor: LexicalEditor

  beforeEach(async () => {
    editor = createTestEditor({ nodes: [HtmlNode], headless: false })
    mockComposerContext(editor)
  })

  it('renders html and guards against a null node', async () => {
    const nodeKey = await addHtmlNode(editor)

    const composerValue = createHostIntegrationValue()
    const { wrapper: CardSelectionStoreProvider } = createSelection(nodeKey)
    render(
      <InklingHostIntegrationProvider value={composerValue}>
        <CardSelectionStoreProvider>
          <HtmlNodeComponent html="<p>Hello</p>" nodeKey={nodeKey} />
        </CardSelectionStoreProvider>
      </InklingHostIntegrationProvider>,
    )

    expect(screen.getByText('Hello')).toBeTruthy()
  })

  describe('action toolbar', () => {
    function renderWithToolbar(
      nodeKey: NodeKey,
      selection: { selected?: boolean; editing?: boolean } = {},
      cardConfig: CardConfig = {},
    ) {
      const composerValue = createHostIntegrationValue({ cardConfig })
      const { wrapper: CardSelectionStoreProvider } = createSelection(nodeKey, selection)
      return render(
        <InklingHostIntegrationProvider value={composerValue}>
          <CardSelectionStoreProvider>
            <HtmlNodeComponent html="<p>Hello</p>" nodeKey={nodeKey} />
          </CardSelectionStoreProvider>
        </InklingHostIntegrationProvider>,
      )
    }

    function getToolbars(container: HTMLElement) {
      return container.querySelectorAll('[data-inkling-card-toolbar="html"]')
    }

    it('hides the toolbar when the card is not selected', async () => {
      const nodeKey = await addHtmlNode(editor)
      const { container } = renderWithToolbar(nodeKey, { selected: false })

      expect(getToolbars(container)).toHaveLength(0)
    })

    it('hides the toolbar while the card is editing', async () => {
      const nodeKey = await addHtmlNode(editor)
      const { container } = renderWithToolbar(nodeKey, { selected: true, editing: true })

      expect(getToolbars(container)).toHaveLength(0)
    })

    it('renders the edit and snippet items when createSnippet is configured', async () => {
      const nodeKey = await addHtmlNode(editor)
      const { container } = renderWithToolbar(nodeKey, { selected: true }, { createSnippet: vi.fn() })

      const toolbars = getToolbars(container)
      expect(toolbars).toHaveLength(1)
      const toolbar = toolbars[0]
      expect(toolbar.querySelectorAll('li')).toHaveLength(3)

      const labels = Array.from(toolbar.querySelectorAll('button')).map((button) => button.getAttribute('aria-label'))
      expect(labels).toEqual(['Edit', 'Save as snippet'])
      expect(toolbar.querySelectorAll('button svg')).toHaveLength(2)
      expect(screen.getByTestId('edit-html')).toBeTruthy()
      expect(screen.getByTestId('create-snippet')).toBeTruthy()
    })

    it('hides the snippet item and its separator when createSnippet is not configured', async () => {
      const nodeKey = await addHtmlNode(editor)
      const { container } = renderWithToolbar(nodeKey, { selected: true })

      const toolbar = getToolbars(container)[0]
      expect(toolbar.querySelectorAll('li')).toHaveLength(1)
      expect(screen.queryByTestId('create-snippet')).toBeNull()
    })

    it('dispatches EDIT_CARD_COMMAND for the card when the edit item is clicked', async () => {
      const nodeKey = await addHtmlNode(editor)
      const dispatchSpy = vi.spyOn(editor, 'dispatchCommand')
      renderWithToolbar(nodeKey, { selected: true })

      fireEvent.click(screen.getByTestId('edit-html'))

      expect(dispatchSpy).toHaveBeenCalledWith(EDIT_CARD_COMMAND, { cardKey: nodeKey })
    })

    it('swaps the menu toolbar for the snippet input when the snippet item is clicked', async () => {
      const nodeKey = await addHtmlNode(editor)
      const { container } = renderWithToolbar(nodeKey, { selected: true }, { createSnippet: vi.fn() })

      fireEvent.click(screen.getByTestId('create-snippet'))

      const toolbars = getToolbars(container)
      expect(toolbars).toHaveLength(1)
      expect(toolbars[0].querySelector('ul')).toBeNull()
      expect(toolbars[0].querySelector('[data-testid="snippet-name"]')).toBeTruthy()
    })
  })
})
