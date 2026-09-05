import { fireEvent, render, screen } from '@testing-library/react'
import { $getRoot, type LexicalEditor, type NodeKey } from 'lexical'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createCardSelectionStoreWrapper } from '#/utils/card-selection-store'
import { mockComposerContext } from '#/utils/composer-context'
import { createHostIntegrationValue } from '#/utils/host-integration-context'
import { createTestEditor } from '#/utils/test-editor'
import { InklingHostIntegrationProvider, type CardConfig } from '@/context/InklingHostIntegrationContext'
import { ButtonNode } from '@/nodes/ButtonNode'
import { ButtonNodeComponent } from '@/nodes/ButtonNodeComponent'
import { EDIT_CARD_COMMAND } from '@/plugins/behaviour/commands'

vi.mock('@lexical/react/LexicalComposerContext', async (importOriginal) => ({
  ...(await importOriginal()),
  useLexicalComposerContext: vi.fn(),
}))

class ResizeObserverMock {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
}

global.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver

// the store equivalent of the old per-test CardContext factory: the card is
// selected and editing unless a test says otherwise
function createSelection(
  nodeKey: NodeKey = 'button-1',
  { selected = true, editing = true }: { selected?: boolean; editing?: boolean } = {},
) {
  return createCardSelectionStoreWrapper({
    initialState: { selectedCardKey: selected ? nodeKey : null, isEditingCard: editing },
  })
}

function addButtonNode(editor: LexicalEditor) {
  return new Promise<NodeKey>((resolve) => {
    editor.update(
      () => {
        const buttonNode = new ButtonNode({
          buttonText: 'Subscribe',
          buttonUrl: 'https://example.com',
          alignment: 'center',
        })
        $getRoot().append(buttonNode)
      },
      { onUpdate: () => resolve(editor.getEditorState().read(() => $getRoot().getFirstChildOrThrow().getKey())) },
    )
  })
}

describe('ButtonNodeComponent', () => {
  let editor: LexicalEditor

  beforeEach(async () => {
    editor = createTestEditor({ nodes: [ButtonNode], headless: false })
    mockComposerContext(editor)
  })

  it('renders with aligned button card props', async () => {
    const nodeKey = await addButtonNode(editor)

    const composerValue = createHostIntegrationValue()
    const { wrapper: CardSelectionStoreProvider } = createSelection(nodeKey)
    render(
      <InklingHostIntegrationProvider value={composerValue}>
        <CardSelectionStoreProvider>
          <ButtonNodeComponent
            alignment="center"
            buttonText="Subscribe"
            buttonUrl="https://example.com"
            nodeKey={nodeKey}
          />
        </CardSelectionStoreProvider>
      </InklingHostIntegrationProvider>,
    )

    expect(screen.getByTestId('button-card')).toBeTruthy()
    expect(screen.getByTestId('button-card-btn').textContent).toBe('Subscribe')
  })

  it('dispatches EDIT_CARD_COMMAND when the toolbar edit button is clicked', async () => {
    const nodeKey = await addButtonNode(editor)
    const dispatchSpy = vi.spyOn(editor, 'dispatchCommand')
    const composerValue = createHostIntegrationValue()
    const { wrapper: CardSelectionStoreProvider } = createSelection(nodeKey, { editing: false })

    render(
      <InklingHostIntegrationProvider value={composerValue}>
        <CardSelectionStoreProvider>
          <ButtonNodeComponent
            alignment="center"
            buttonText="Subscribe"
            buttonUrl="https://example.com"
            nodeKey={nodeKey}
          />
        </CardSelectionStoreProvider>
      </InklingHostIntegrationProvider>,
    )

    fireEvent.click(screen.getByTestId('edit-button-card'))
    expect(dispatchSpy).toHaveBeenCalledWith(EDIT_CARD_COMMAND, { cardKey: nodeKey })
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
            <ButtonNodeComponent
              alignment="center"
              buttonText="Subscribe"
              buttonUrl="https://example.com"
              nodeKey={nodeKey}
            />
          </CardSelectionStoreProvider>
        </InklingHostIntegrationProvider>,
      )
    }

    function getToolbars(container: HTMLElement) {
      return container.querySelectorAll('[data-inkling-card-toolbar="button"]')
    }

    it('hides the toolbar when the card is not selected', async () => {
      const nodeKey = await addButtonNode(editor)
      const { container } = renderWithToolbar(nodeKey, { selected: false, editing: false })

      expect(getToolbars(container)).toHaveLength(0)
    })

    it('hides the toolbar while the card is editing', async () => {
      const nodeKey = await addButtonNode(editor)
      const { container } = renderWithToolbar(nodeKey, { selected: true, editing: true })

      expect(getToolbars(container)).toHaveLength(0)
    })

    it('renders edit, separator, and snippet items when selected', async () => {
      const nodeKey = await addButtonNode(editor)
      const { container } = renderWithToolbar(nodeKey, { selected: true, editing: false }, { createSnippet: vi.fn() })

      const toolbars = getToolbars(container)
      expect(toolbars).toHaveLength(1)
      const toolbar = toolbars[0]
      expect(toolbar.querySelectorAll('li')).toHaveLength(3)

      const labels = Array.from(toolbar.querySelectorAll('button')).map((button) => button.getAttribute('aria-label'))
      expect(labels).toEqual(['Edit', 'Save as snippet'])
      // every item renders an icon
      expect(toolbar.querySelectorAll('button svg')).toHaveLength(2)
      expect(screen.getByTestId('edit-button-card')).toBeTruthy()
      expect(screen.getByTestId('create-snippet')).toBeTruthy()
    })

    it('hides the snippet item and its separator when createSnippet is not configured', async () => {
      const nodeKey = await addButtonNode(editor)
      const { container } = renderWithToolbar(nodeKey, { selected: true, editing: false })

      const toolbar = getToolbars(container)[0]
      expect(toolbar.querySelectorAll('li')).toHaveLength(1)
      expect(screen.getByTestId('edit-button-card')).toBeTruthy()
      expect(screen.queryByTestId('create-snippet')).toBeNull()
    })

    it('swaps the menu toolbar for the snippet input when the snippet item is clicked', async () => {
      const nodeKey = await addButtonNode(editor)
      const { container } = renderWithToolbar(nodeKey, { selected: true, editing: false }, { createSnippet: vi.fn() })

      fireEvent.click(screen.getByTestId('create-snippet'))

      const toolbars = getToolbars(container)
      expect(toolbars).toHaveLength(1)
      expect(toolbars[0].querySelector('ul')).toBeNull()
      expect(toolbars[0].querySelector('[data-testid="snippet-name"]')).toBeTruthy()
    })
  })
})
