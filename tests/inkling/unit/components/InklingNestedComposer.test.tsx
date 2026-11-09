import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { $createParagraphNode, $createTextNode, $getRoot, createEditor } from 'lexical'
import React from 'react'
import { describe, expect, it } from 'vitest'

import { updateEditor } from '#/inkling/utils/test-editor'
import InklingComposer from '@/inkling/components/InklingComposer'
import InklingEditor from '@/inkling/components/InklingEditor'
import InklingErrorBoundary from '@/inkling/components/InklingErrorBoundary'
import InklingNestedComposer from '@/inkling/components/InklingNestedComposer'
import { ExtendedTextNode, TKNode, extendedTextNodeReplacement } from '@/inkling/nodes/base'

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

  it('keeps composer contexts available to card decorators and their nested editors', async () => {
    const initialEditorState = JSON.stringify({
      root: {
        children: [
          {
            type: 'image',
            version: 1,
            src: '/image.png',
            width: 100,
            height: 100,
            title: '',
            alt: 'Example image',
            caption: '',
            cardWidth: 'regular',
            href: '',
          },
        ],
        direction: null,
        format: '',
        indent: 0,
        type: 'root',
        version: 1,
      },
    })

    render(
      <InklingComposer initialEditorState={initialEditorState}>
        <InklingEditor />
      </InklingComposer>,
    )

    fireEvent.click(await screen.findByTestId('image-card-populated'))

    expect(await screen.findByTestId('alt-toggle-button')).toBeInTheDocument()
  })
})
