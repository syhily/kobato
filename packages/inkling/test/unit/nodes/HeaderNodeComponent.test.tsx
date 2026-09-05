import { CollaborationContext } from '@lexical/react/LexicalCollaborationContext'
import { LexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { fireEvent, render, screen } from '@testing-library/react'
import { createEditor, $getRoot, type LexicalEditor, type NodeKey } from 'lexical'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createCardSelectionStoreWrapper } from '#/utils/card-selection-store'
import { createHostIntegrationValue } from '#/utils/host-integration-context'
import { createTestEditor } from '#/utils/test-editor'
import { InklingHostIntegrationProvider, type CardConfig } from '@/context/InklingHostIntegrationContext'
import HeaderNodeComponent from '@/nodes/header/HeaderNodeComponent'
import { $createHeaderNode, HeaderNode } from '@/nodes/HeaderNode'
import MINIMAL_NODES from '@/nodes/MinimalNodes'
import { EDIT_CARD_COMMAND } from '@/plugins/behaviour/commands'

function createLexicalComposerContext(editor: LexicalEditor): [LexicalEditor, { getTheme: () => undefined }] {
  return [editor, { getTheme: () => undefined }]
}

function createCollaborationContext() {
  return { color: '#000000', isCollabActive: false, name: 'test', yjsDocMap: new Map() }
}

// the store equivalent of the old per-test CardContext factory: the card is
// selected and not editing unless a test says otherwise
function createSelection(
  nodeKey: NodeKey,
  { selected = true, editing = false }: { selected?: boolean; editing?: boolean } = {},
) {
  return createCardSelectionStoreWrapper({
    initialState: { selectedCardKey: selected ? nodeKey : null, isEditingCard: editing },
  })
}

function getToolbars(container: HTMLElement) {
  return container.querySelectorAll('[data-inkling-card-toolbar="header"]')
}

describe('HeaderNodeComponent', () => {
  let editor: LexicalEditor
  let headerTextEditor: LexicalEditor
  let subheaderTextEditor: LexicalEditor

  beforeEach(() => {
    editor = createTestEditor({ nodes: [HeaderNode], headless: false })
    headerTextEditor = createEditor({ namespace: 'header-text', nodes: MINIMAL_NODES, onError: () => {} })
    subheaderTextEditor = createEditor({ namespace: 'subheader-text', nodes: MINIMAL_NODES, onError: () => {} })
  })

  function addHeaderNode(editor: LexicalEditor) {
    return new Promise<NodeKey>((resolve) => {
      editor.update(
        () => {
          const headerNode = $createHeaderNode({})
          $getRoot().append(headerNode)
        },
        { onUpdate: () => resolve(editor.getEditorState().read(() => $getRoot().getFirstChildOrThrow().getKey())) },
      )
    })
  }

  function renderComponent(
    nodeKey: NodeKey,
    selection: { selected?: boolean; editing?: boolean } = {},
    cardConfig: CardConfig = {},
  ) {
    const collaborationValue = createCollaborationContext()
    const composerValue = createLexicalComposerContext(editor)
    const inklingComposerValue = createHostIntegrationValue({
      cardConfig,
      fileTypes: { image: { mimeTypes: ['image/png'] } },
    })
    const { wrapper: CardSelectionStoreProvider } = createSelection(nodeKey, selection)
    return render(
      <CollaborationContext.Provider value={collaborationValue}>
        <LexicalComposerContext.Provider value={composerValue}>
          <InklingHostIntegrationProvider value={inklingComposerValue}>
            <CardSelectionStoreProvider>
              <HeaderNodeComponent
                alignment="left"
                backgroundColor="transparent"
                backgroundImageHeight={null}
                backgroundImageSrc=""
                backgroundImageWidth={null}
                backgroundSize=""
                buttonColor=""
                buttonEnabled={false}
                buttonText=""
                buttonTextColor=""
                buttonUrl=""
                headerTextEditor={headerTextEditor}
                isSwapped={false}
                layout="regular"
                nodeKey={nodeKey}
                subheaderTextEditor={subheaderTextEditor}
                textColor=""
              />
            </CardSelectionStoreProvider>
          </InklingHostIntegrationProvider>
        </LexicalComposerContext.Provider>
      </CollaborationContext.Provider>,
    )
  }

  describe('action toolbar', () => {
    it('hides the toolbar when the card is not selected', async () => {
      const nodeKey = await addHeaderNode(editor)
      const { container } = renderComponent(nodeKey, { selected: false })

      expect(getToolbars(container)).toHaveLength(0)
    })

    it('hides the toolbar while the card is editing', async () => {
      const nodeKey = await addHeaderNode(editor)
      const { container } = renderComponent(nodeKey, { selected: true, editing: true })

      expect(getToolbars(container)).toHaveLength(0)
    })

    it('renders edit, separator, and snippet items when selected', async () => {
      const nodeKey = await addHeaderNode(editor)
      const { container } = renderComponent(nodeKey, { selected: true }, { createSnippet: vi.fn() })

      const toolbars = getToolbars(container)
      expect(toolbars).toHaveLength(1)
      const toolbar = toolbars[0]
      expect(toolbar.querySelectorAll('li')).toHaveLength(3)

      const labels = Array.from(toolbar.querySelectorAll('button')).map((button) => button.getAttribute('aria-label'))
      expect(labels).toEqual(['Edit', 'Save as snippet'])
      expect(toolbar.querySelectorAll('button svg')).toHaveLength(2)
      expect(screen.getByTestId('create-snippet')).toBeTruthy()
    })

    it('hides the snippet item and its separator when createSnippet is not configured', async () => {
      const nodeKey = await addHeaderNode(editor)
      const { container } = renderComponent(nodeKey, { selected: true })

      const toolbar = getToolbars(container)[0]
      expect(toolbar.querySelectorAll('li')).toHaveLength(1)
      expect(screen.queryByTestId('create-snippet')).toBeNull()
    })

    it('dispatches EDIT_CARD_COMMAND for the card when the edit item is clicked', async () => {
      const nodeKey = await addHeaderNode(editor)
      const dispatchSpy = vi.spyOn(editor, 'dispatchCommand')
      renderComponent(nodeKey, { selected: true })

      fireEvent.click(screen.getByRole('button', { name: 'Edit' }))

      expect(dispatchSpy).toHaveBeenCalledWith(EDIT_CARD_COMMAND, { cardKey: nodeKey })
    })

    it('swaps the menu toolbar for the snippet input when the snippet item is clicked', async () => {
      const nodeKey = await addHeaderNode(editor)
      const { container } = renderComponent(nodeKey, { selected: true }, { createSnippet: vi.fn() })

      fireEvent.click(screen.getByTestId('create-snippet'))

      const toolbars = getToolbars(container)
      expect(toolbars).toHaveLength(1)
      expect(toolbars[0].querySelector('ul')).toBeNull()
      expect(toolbars[0].querySelector('[data-testid="snippet-name"]')).toBeTruthy()
    })
  })
})
