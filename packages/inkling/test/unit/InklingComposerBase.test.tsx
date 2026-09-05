import type { SerializedEditorState, SerializedParagraphNode, SerializedTextNode } from 'lexical'

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { render } from '@testing-library/react'
import React from 'react'
import { describe, expect, it } from 'vitest'

import InklingComposerBase from '@/components/InklingComposerBase'
import InklingErrorBoundary from '@/components/InklingErrorBoundary'
import MINIMAL_NODES from '@/nodes/MinimalNodes'
import { getRegisteredNodeMap } from '@/utils/lexical-internals'

// The core composer variant (plan C5): boots with the card-free MINIMAL_NODES
// set and serializes back out — the composition the `./core` entry exports.

function EditorTree() {
  return (
    <RichTextPlugin contentEditable={<ContentEditable />} ErrorBoundary={InklingErrorBoundary} placeholder={null} />
  )
}

const stateWithText = JSON.stringify({
  root: {
    children: [
      {
        children: [{ detail: 0, format: 0, mode: 'normal', style: '', text: 'hello', type: 'text', version: 1 }],
        direction: 'ltr',
        format: '',
        indent: 0,
        type: 'paragraph',
        version: 1,
      },
    ],
    direction: 'ltr',
    format: '',
    indent: 0,
    type: 'root',
    version: 1,
  },
})

describe('InklingComposerBase', () => {
  it('renders with the minimal node set', () => {
    const { container } = render(
      <InklingComposerBase nodes={MINIMAL_NODES}>
        <EditorTree />
      </InklingComposerBase>,
    )

    expect(container.querySelector('[contenteditable]')).toBeInTheDocument()
  })

  it('boots from an initial state and serializes it back', () => {
    let serialized: SerializedEditorState | undefined

    function EditorStateConsumer() {
      const [editor] = useLexicalComposerContext()
      React.useEffect(() => {
        serialized = editor.getEditorState().toJSON()
      }, [editor])
      return null
    }

    const { container } = render(
      <InklingComposerBase nodes={MINIMAL_NODES} initialEditorState={stateWithText}>
        <EditorTree />
        <EditorStateConsumer />
      </InklingComposerBase>,
    )

    expect(container.querySelector('[contenteditable]')).toHaveTextContent('hello')
    expect(serialized).toBeDefined()
    const paragraph = serialized?.root.children[0] as SerializedParagraphNode | undefined
    expect(paragraph?.type).toBe('paragraph')
    // MINIMAL_NODES replaces TextNode with ExtendedTextNode, so the imported
    // text serializes under the extended type
    const text = paragraph?.children[0] as SerializedTextNode | undefined
    expect(text).toMatchObject({ text: 'hello', type: 'extended-text' })
  })

  it('registers exactly the provided nodes — no card types leak in', () => {
    const registeredTypes: string[] = []

    function NodeMapConsumer() {
      const [editor] = useLexicalComposerContext()
      React.useEffect(() => {
        registeredTypes.push(...getRegisteredNodeMap(editor).keys())
      }, [editor])
      return null
    }

    render(
      <InklingComposerBase nodes={MINIMAL_NODES}>
        <EditorTree />
        <NodeMapConsumer />
      </InklingComposerBase>,
    )

    expect(registeredTypes).toContain('link')
    expect(registeredTypes).toContain('extended-text')
    expect(registeredTypes).not.toContain('codeblock')
    expect(registeredTypes).not.toContain('image')
    expect(registeredTypes).not.toContain('horizontalrule')
  })
})
