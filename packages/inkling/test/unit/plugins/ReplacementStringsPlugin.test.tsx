import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { LexicalNestedComposer } from '@lexical/react/LexicalNestedComposer'
import { render } from '@testing-library/react'
import { $createParagraphNode, $createTextNode, $getRoot, $isElementNode, $isTextNode, createEditor } from 'lexical'
import React from 'react'
import { beforeEach, describe, expect, it } from 'vitest'

import { tick, updateEditor } from '#/utils/test-editor'
import CardContext from '@/context/CardContext'
import { TKHandleContext } from '@/context/TKHandleContext'
import { ExtendedTextNode, TKNode, extendedTextNodeReplacement } from '@/nodes/base'
import { createTKHandle } from '@/plugins/behaviour/tkHandle'
import ReplacementStringsPlugin from '@/plugins/ReplacementStringsPlugin'

const NESTED_NODES = [ExtendedTextNode, extendedTextNodeReplacement, TKNode]

const cardContextValue: React.ContextType<typeof CardContext> = {
  captionHasFocus: false,
  nodeKey: 'card-1',
  setCaptionHasFocus: () => {},
}

function TestWrapper({ children }: { children: React.ReactNode }) {
  const [tkHandle] = React.useState(createTKHandle)
  return (
    <LexicalComposer
      initialConfig={{
        namespace: 'test',
        nodes: NESTED_NODES,
        onError: () => {},
        theme: {},
      }}
    >
      <TKHandleContext.Provider value={tkHandle}>
        <CardContext.Provider value={cardContextValue}>{children}</CardContext.Provider>
      </TKHandleContext.Provider>
    </LexicalComposer>
  )
}

describe('ReplacementStringsPlugin in nested editors', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>'
  })

  it('formats {first_name} as code in a nested editor', async () => {
    const parentEditor = createEditor({
      namespace: 'parent',
      nodes: NESTED_NODES,
      onError: () => {},
    })

    const nestedEditor = createEditor({
      namespace: 'nested',
      nodes: NESTED_NODES,
      parentEditor,
      onError: () => {},
    })

    render(
      <TestWrapper>
        <LexicalNestedComposer initialEditor={nestedEditor}>
          <ReplacementStringsPlugin />
        </LexicalNestedComposer>
      </TestWrapper>,
    )

    // Wait for React effects to run so the transform is registered
    await tick()

    await updateEditor(nestedEditor, () => {
      const root = $getRoot()
      root.clear()
      const paragraph = $createParagraphNode()
      paragraph.append($createTextNode('Hello {first_name}!'))
      root.append(paragraph)
    })

    nestedEditor.getEditorState().read(() => {
      const root = $getRoot()
      const paragraph = root.getFirstChild()
      expect(paragraph).not.toBeNull()
      if (!$isElementNode(paragraph)) {
        throw new Error('Expected a paragraph node')
      }
      const nodes = paragraph.getChildren()
      expect(nodes.length).toBeGreaterThanOrEqual(1)

      const codeNode = nodes.find((node) => $isTextNode(node) && node.hasFormat('code'))
      expect($isTextNode(codeNode)).toBe(true)
      if (!$isTextNode(codeNode)) {
        throw new Error('Expected a formatted text node')
      }
      expect(codeNode.getTextContent()).toBe('{first_name}')
    })
  })
})
