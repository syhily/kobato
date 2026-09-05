import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { render, screen, waitFor } from '@testing-library/react'
import { $createParagraphNode, $createTextNode, $getRoot, createEditor } from 'lexical'
import React from 'react'
import { describe, expect, it } from 'vitest'

import { updateEditor } from '#/utils/test-editor'
import InklingComposer from '@/components/InklingComposer'
import InklingErrorBoundary from '@/components/InklingErrorBoundary'
import InklingNestedComposer from '@/components/InklingNestedComposer'
import { ExtendedTextNode, TKNode, extendedTextNodeReplacement } from '@/nodes/base'

const NESTED_NODES = [ExtendedTextNode, extendedTextNodeReplacement, TKNode]

describe('InklingNestedComposer', () => {
  it('renders a nested editable surface inside a parent composer', async () => {
    const nestedEditor = createEditor({
      namespace: 'nested',
      nodes: NESTED_NODES,
      onError: () => {},
    })

    await updateEditor(
      nestedEditor,
      () => {
        const root = $getRoot()
        root.append($createParagraphNode().append($createTextNode('nested content')))
      },
      { discrete: true },
    )

    render(
      <InklingComposer>
        <InklingNestedComposer initialEditor={nestedEditor}>
          <RichTextPlugin
            contentEditable={<ContentEditable data-testid="nested-editable" />}
            ErrorBoundary={InklingErrorBoundary}
            placeholder={null}
          />
        </InklingNestedComposer>
      </InklingComposer>,
    )

    const editable = screen.getByTestId('nested-editable')
    expect(editable).toBeInTheDocument()
    await waitFor(() => {
      expect(editable).toHaveTextContent('nested content')
    })
  })
})
