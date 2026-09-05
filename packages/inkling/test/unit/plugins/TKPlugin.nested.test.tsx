import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { LexicalNestedComposer } from '@lexical/react/LexicalNestedComposer'
import { render } from '@testing-library/react'
import { $createParagraphNode, $createTextNode, $getRoot, $isElementNode, createEditor } from 'lexical'
import React from 'react'
import { beforeEach, describe, expect, it } from 'vitest'

import { tick, updateEditor } from '#/utils/test-editor'
import CardContext from '@/context/CardContext'
import { TKHandleContext } from '@/context/TKHandleContext'
import { ExtendedTextNode, TKNode, extendedTextNodeReplacement, $isTKNode } from '@/nodes/base'
import { createTKHandle } from '@/plugins/behaviour/tkHandle'
import TKPlugin from '@/plugins/TKPlugin'

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

describe('TKPlugin in nested editors', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>'
  })

  it('creates a TKNode when typing TK in a nested editor', async () => {
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
          <TKPlugin />
        </LexicalNestedComposer>
      </TestWrapper>,
    )

    // Wait for React effects to run so TKPlugin registers its transforms
    await tick()

    await updateEditor(nestedEditor, () => {
      const root = $getRoot()
      root.clear()
      const paragraph = $createParagraphNode()
      paragraph.append($createTextNode('TK'))
      root.append(paragraph)
    })

    nestedEditor.getEditorState().read(() => {
      const root = $getRoot()
      const paragraph = root.getFirstChild()
      if (!$isElementNode(paragraph)) {
        throw new Error('Expected nested editor paragraph')
      }
      const firstNode = paragraph.getFirstChild()
      expect(firstNode).not.toBeNull()
      expect($isTKNode(firstNode)).toBe(true)
    })
  })
})
