import { render, screen } from '@testing-library/react'
import { $getRoot, createEditor, type LexicalEditor, type NodeKey } from 'lexical'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CardWidth } from '@/nodes/base/utils/card-widths'

import { createCardSelectionStoreWrapper } from '#/utils/card-selection-store'
import { mockComposerContext } from '#/utils/composer-context'
import { createHostIntegrationValue } from '#/utils/host-integration-context'
import InklingCardWrapper from '@/components/InklingCardWrapper'
import { useCardSelectionStore } from '@/context/CardSelectionStoreContext'
import { InklingHostIntegrationProvider, type CardConfig } from '@/context/InklingHostIntegrationContext'
import { HtmlNode } from '@/nodes/HtmlNode'

vi.mock('@lexical/react/LexicalComposerContext', () => ({
  useLexicalComposerContext: vi.fn(),
}))

function createTestEditor(): LexicalEditor {
  return createEditor({ namespace: 'test', nodes: [HtmlNode], onError: () => {} })
}

function addHtmlNode(editor: LexicalEditor, dataset: Record<string, unknown> = {}) {
  return new Promise<NodeKey>((resolve) => {
    editor.update(
      () => {
        $getRoot().append(new HtmlNode({ html: '<p>Hello</p>', ...dataset }))
      },
      { onUpdate: () => resolve(editor.getEditorState().read(() => $getRoot().getFirstChildOrThrow().getKey())) },
    )
  })
}

function SelectCard({ nodeKey }: { nodeKey: NodeKey }) {
  const store = useCardSelectionStore()
  React.useEffect(() => {
    store.setState({ selectedCardKey: nodeKey })
  }, [nodeKey, store])
  return null
}

function renderWrapper(nodeKey: NodeKey, { cardConfig, select }: { cardConfig?: CardConfig; select?: boolean } = {}) {
  const composerValue = createHostIntegrationValue({ cardConfig })
  const { wrapper: CardSelectionStoreProvider } = createCardSelectionStoreWrapper()
  return render(
    <InklingHostIntegrationProvider value={composerValue}>
      <CardSelectionStoreProvider>
        {select ? <SelectCard nodeKey={nodeKey} /> : null}
        <InklingCardWrapper nodeKey={nodeKey}>
          <div data-testid="card-content">card content</div>
        </InklingCardWrapper>
      </CardSelectionStoreProvider>
    </InklingHostIntegrationProvider>,
  )
}

function renderWrapperWithWidth(nodeKey: NodeKey, width: CardWidth) {
  const composerValue = createHostIntegrationValue()
  const { wrapper: CardSelectionStoreProvider } = createCardSelectionStoreWrapper()
  const tree = (nextWidth: CardWidth) => (
    <InklingHostIntegrationProvider value={composerValue}>
      <CardSelectionStoreProvider>
        <InklingCardWrapper nodeKey={nodeKey} width={nextWidth}>
          <div data-testid="card-content">card content</div>
        </InklingCardWrapper>
      </CardSelectionStoreProvider>
    </InklingHostIntegrationProvider>
  )
  const result = render(tree(width))
  return { ...result, rerenderWidth: (nextWidth: CardWidth) => result.rerender(tree(nextWidth)) }
}

describe('InklingCardWrapper', () => {
  let editor: LexicalEditor

  beforeEach(async () => {
    editor = createTestEditor()
    mockComposerContext(editor)
  })

  it('renders children with the card type derived from the node', async () => {
    const nodeKey = await addHtmlNode(editor)

    const { container } = renderWrapper(nodeKey)
    const card = container.querySelector('[data-inkling-card="html"]')

    expect(screen.getByTestId('card-content')).toBeInTheDocument()
    expect(card).toBeInTheDocument()
    expect(card).toHaveAttribute('data-inkling-card-selected', 'false')
    expect(card).toHaveClass('z-10')
  })

  it('toggles the selected state with the card selection store', async () => {
    const nodeKey = await addHtmlNode(editor)

    const { container } = renderWrapper(nodeKey, { select: true })
    const card = container.querySelector('[data-inkling-card="html"]')!

    expect(card).toHaveAttribute('data-inkling-card-selected', 'true')
    expect(card).toHaveClass('z-20')
  })

  it('keys the decorator parent data attribute off the width prop', async () => {
    const nodeKey = await addHtmlNode(editor)

    // in this harness the decorator parent element is the render container;
    // in the product it is Lexical's decorator div
    const { container, rerenderWidth } = renderWrapperWithWidth(nodeKey, 'wide')
    expect(container).toHaveAttribute('data-inkling-card-width', 'wide')

    // 'regular' deletes the attribute so there is less test churn
    rerenderWidth('regular')
    expect(container).not.toHaveAttribute('data-inkling-card-width')

    rerenderWidth('wide')
    expect(container).toHaveAttribute('data-inkling-card-width', 'wide')
  })
})
