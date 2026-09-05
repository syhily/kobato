import { fireEvent, render, screen } from '@testing-library/react'
import { $getRoot, type LexicalEditor, type NodeKey } from 'lexical'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createCardSelectionStoreWrapper } from '#/utils/card-selection-store'
import { mockComposerContext } from '#/utils/composer-context'
import { createHostIntegrationValue } from '#/utils/host-integration-context'
import { createTestEditor } from '#/utils/test-editor'
import { InklingHostIntegrationProvider, type CardConfig } from '@/context/InklingHostIntegrationContext'
import InklingUiPrefsContext from '@/context/InklingUiPrefsContext'
import { DEFAULT_LABELS } from '@/labels/inkling-labels'
import { CodeBlockNode } from '@/nodes/CodeBlockNode'
import { CodeBlockNodeComponent } from '@/nodes/CodeBlockNodeComponent'
import { EDIT_CARD_COMMAND } from '@/plugins/behaviour/commands'

vi.mock('@lexical/react/LexicalComposerContext', () => ({
  useLexicalComposerContext: vi.fn(),
}))

vi.mock('../../../src/components/ui/CardCaptionEditor', () => ({
  CardCaptionEditor: () => <div data-testid="card-caption-editor" />,
}))

// the store equivalent of the old per-test CardContext factory: the card is
// selected and not editing unless a test says otherwise
function createSelection(
  nodeKey: NodeKey = 'code-1',
  { selected = true, editing = false }: { selected?: boolean; editing?: boolean } = {},
) {
  return createCardSelectionStoreWrapper({
    initialState: { selectedCardKey: selected ? nodeKey : null, isEditingCard: editing },
  })
}

// the code preview's dark/light styling reads the UI-prefs context, a
// separate lifecycle from the host-integration value (plan 047)
function createUiPrefsValue(darkMode: boolean) {
  return { darkMode, labels: DEFAULT_LABELS }
}

function addCodeBlockNode(editor: LexicalEditor): Promise<NodeKey> {
  return new Promise((resolve) => {
    editor.update(
      () => {
        const node = new CodeBlockNode({ code: 'const a = 1', language: 'javascript' })
        $getRoot().append(node)
      },
      { onUpdate: () => resolve(editor.getEditorState().read(() => $getRoot().getFirstChildOrThrow().getKey())) },
    )
  })
}

function renderComponent(nodeKey: NodeKey, darkMode: boolean) {
  const composerValue = createHostIntegrationValue()
  const { wrapper: CardSelectionStoreProvider } = createSelection(nodeKey)
  return render(
    <InklingHostIntegrationProvider value={composerValue}>
      <InklingUiPrefsContext.Provider value={createUiPrefsValue(darkMode)}>
        <CardSelectionStoreProvider>
          <CodeBlockNodeComponent code="const a = 1" language="javascript" nodeKey={nodeKey} />
        </CardSelectionStoreProvider>
      </InklingUiPrefsContext.Provider>
    </InklingHostIntegrationProvider>,
  )
}

describe('CodeBlockNodeComponent', () => {
  let editor: LexicalEditor

  beforeEach(async () => {
    editor = createTestEditor({ nodes: [CodeBlockNode], headless: false })
    mockComposerContext(editor)
  })

  it('dispatches EDIT_CARD_COMMAND when the toolbar Edit button is clicked', async () => {
    const nodeKey = await addCodeBlockNode(editor)
    const dispatchSpy = vi.spyOn(editor, 'dispatchCommand')

    renderComponent(nodeKey, false)

    fireEvent.click(screen.getByTestId('edit-code-block-card'))

    expect(dispatchSpy).toHaveBeenCalledWith(EDIT_CARD_COMMAND, { cardKey: nodeKey })
  })

  it('renders a dark preview when darkMode is enabled', async () => {
    const nodeKey = await addCodeBlockNode(editor)

    const { container } = renderComponent(nodeKey, true)

    expect(container.querySelector('pre')).toHaveClass('bg-grey-950')
  })

  it('renders a light preview when darkMode is disabled', async () => {
    const nodeKey = await addCodeBlockNode(editor)

    const { container } = renderComponent(nodeKey, false)

    expect(container.querySelector('pre')).toHaveClass('bg-grey-100')
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
          <InklingUiPrefsContext.Provider value={createUiPrefsValue(false)}>
            <CardSelectionStoreProvider>
              <CodeBlockNodeComponent code="const a = 1" language="javascript" nodeKey={nodeKey} />
            </CardSelectionStoreProvider>
          </InklingUiPrefsContext.Provider>
        </InklingHostIntegrationProvider>,
      )
    }

    function getToolbars(container: HTMLElement) {
      return container.querySelectorAll('[data-inkling-card-toolbar="code-block"]')
    }

    it('hides the toolbar when the card is not selected', async () => {
      const nodeKey = await addCodeBlockNode(editor)
      const { container } = renderWithToolbar(nodeKey, { selected: false })

      expect(getToolbars(container)).toHaveLength(0)
    })

    it('hides the toolbar while the card is editing', async () => {
      const nodeKey = await addCodeBlockNode(editor)
      const { container } = renderWithToolbar(nodeKey, { selected: true, editing: true })

      expect(getToolbars(container)).toHaveLength(0)
    })

    it('renders edit, separator, and snippet items when selected', async () => {
      const nodeKey = await addCodeBlockNode(editor)
      const { container } = renderWithToolbar(nodeKey, { selected: true }, { createSnippet: vi.fn() })

      const toolbars = getToolbars(container)
      expect(toolbars).toHaveLength(1)
      const toolbar = toolbars[0]
      expect(toolbar.querySelectorAll('li')).toHaveLength(3)

      const labels = Array.from(toolbar.querySelectorAll('button')).map((button) => button.getAttribute('aria-label'))
      expect(labels).toEqual(['Edit', 'Save as snippet'])
      expect(toolbar.querySelectorAll('button svg')).toHaveLength(2)
      expect(screen.getByTestId('edit-code-block-card')).toBeTruthy()
      expect(screen.getByTestId('create-snippet')).toBeTruthy()
    })

    it('hides the snippet item and its separator when createSnippet is not configured', async () => {
      const nodeKey = await addCodeBlockNode(editor)
      const { container } = renderWithToolbar(nodeKey, { selected: true })

      const toolbar = getToolbars(container)[0]
      expect(toolbar.querySelectorAll('li')).toHaveLength(1)
      expect(screen.getByTestId('edit-code-block-card')).toBeTruthy()
      expect(screen.queryByTestId('create-snippet')).toBeNull()
    })

    it('swaps the menu toolbar for the snippet input when the snippet item is clicked', async () => {
      const nodeKey = await addCodeBlockNode(editor)
      const { container } = renderWithToolbar(nodeKey, { selected: true }, { createSnippet: vi.fn() })

      fireEvent.click(screen.getByTestId('create-snippet'))

      const toolbars = getToolbars(container)
      expect(toolbars).toHaveLength(1)
      expect(toolbars[0].querySelector('ul')).toBeNull()
      expect(toolbars[0].querySelector('[data-testid="snippet-name"]')).toBeTruthy()
    })
  })
})
