import { CollaborationContext } from '@lexical/react/LexicalCollaborationContext'
import { LexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { fireEvent, render, screen } from '@testing-library/react'
import { createEditor, $getRoot, type LexicalEditor, type NodeKey } from 'lexical'
import { describe, expect, it, vi } from 'vitest'

import { createCardSelectionStoreWrapper } from '#/utils/card-selection-store'
import { createHostIntegrationValue } from '#/utils/host-integration-context'
import { createTestEditor } from '#/utils/test-editor'
import { InklingHostIntegrationProvider } from '@/context/InklingHostIntegrationContext'
import { CARD_DECLARATIONS } from '@/nodes/cards'
import { getCardToolbarLabel } from '@/nodes/cards/card-facts'
import HeaderNodeComponent from '@/nodes/header/HeaderNodeComponent'
import { $createHeaderNode, HeaderNode } from '@/nodes/HeaderNode'
import MINIMAL_NODES from '@/nodes/MinimalNodes'

function createLexicalComposerContext(editor: LexicalEditor): [LexicalEditor, { getTheme: () => undefined }] {
  return [editor, { getTheme: () => undefined }]
}

function createCollaborationContext() {
  return { color: '#000000', isCollabActive: false, name: 'test', yjsDocMap: new Map() }
}

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

// The toolbar label (data-inkling-card-toolbar) is a live e2e selector
// contract and declaration data: CardActionToolbar resolves it from the
// declaration by the node's own type, so a hardcoded per-component literal
// can never ship the wrong label again — a copy-paste from
// SignupNodeComponent once labeled the header card "signup" on both toolbars.
describe('card toolbar labels as a derived view over the declarations', () => {
  it('gives every declaration a non-empty toolbar label', () => {
    for (const declaration of CARD_DECLARATIONS) {
      expect(declaration.toolbarLabel).toBeTruthy()
      expect(getCardToolbarLabel(declaration.nodeType)).toBe(declaration.toolbarLabel)
    }
  })

  it('keeps the divergent labels as declaration data — they are e2e contracts, not node types', () => {
    expect(getCardToolbarLabel('codeblock')).toBe('code-block')
    expect(getCardToolbarLabel('file')).toBe('file-upload')
  })

  it('renders the declaration label on the card toolbars ("header", not "signup")', async () => {
    const editor = createTestEditor({ nodes: [HeaderNode], headless: false })
    const nodeKey = await addHeaderNode(editor)
    const collaborationValue = createCollaborationContext()
    const composerValue = createLexicalComposerContext(editor)
    const inklingComposerValue = createHostIntegrationValue({
      cardConfig: { createSnippet: vi.fn() },
      fileTypes: { image: { mimeTypes: ['image/png'] } },
    })
    const { wrapper: CardSelectionStoreProvider } = createCardSelectionStoreWrapper({
      initialState: { selectedCardKey: nodeKey },
    })

    const { container } = render(
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
                headerTextEditor={createEditor({ namespace: 'header-text', nodes: MINIMAL_NODES, onError: () => {} })}
                isSwapped={false}
                layout="regular"
                nodeKey={nodeKey}
                subheaderTextEditor={createEditor({
                  namespace: 'subheader-text',
                  nodes: MINIMAL_NODES,
                  onError: () => {},
                })}
                textColor=""
              />
            </CardSelectionStoreProvider>
          </InklingHostIntegrationProvider>
        </LexicalComposerContext.Provider>
      </CollaborationContext.Provider>,
    )

    // the menu toolbar carries the contract value
    expect(container.querySelectorAll('[data-inkling-card-toolbar="header"]')).toHaveLength(1)
    expect(container.querySelector('[data-inkling-card-toolbar="signup"]')).toBeNull()

    // and so does the snippet-creation toolbar that replaces it
    fireEvent.click(screen.getByTestId('create-snippet'))
    const toolbars = container.querySelectorAll('[data-inkling-card-toolbar="header"]')
    expect(toolbars).toHaveLength(1)
    expect(toolbars[0].querySelector('[data-testid="snippet-name"]')).toBeTruthy()
    expect(container.querySelector('[data-inkling-card-toolbar="signup"]')).toBeNull()
  })
})
