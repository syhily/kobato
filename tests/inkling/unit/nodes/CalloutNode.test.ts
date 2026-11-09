import { createHeadlessEditor } from '@lexical/headless'
import { $createParagraphNode, $createTextNode, $getRoot, type LexicalEditor } from 'lexical'
import { beforeEach, describe, expect, it } from 'vitest'

import { getCardMenu } from '#/inkling/utils/card-menu'
import { updateEditor } from '#/inkling/utils/test-editor'
import { CalloutNode, $createCalloutNode, $isCalloutNode, INSERT_CALLOUT_COMMAND } from '@/inkling/nodes/CalloutNode'
import { getCardDragIcon } from '@/inkling/nodes/cards/card-menus'

const editorNodes = [CalloutNode]

describe('CalloutNode', () => {
  let editor: LexicalEditor

  beforeEach(() => {
    editor = createHeadlessEditor({ nodes: editorNodes, onError: () => {} })
  })

  it('matches node with $isCalloutNode', async () => {
    await updateEditor(editor, () => {
      const calloutNode = $createCalloutNode({})
      expect($isCalloutNode(calloutNode)).toBe(true)
    })
  })

  it('resolves a card menu entry', () => {
    expect(getCardMenu('callout')?.[0]?.label).toBe('Callout')
    expect(getCardMenu('callout')?.[0]?.insertCommand).toBe(INSERT_CALLOUT_COMMAND)
  })

  it('resolves the callout drag icon from the card menu', () => {
    expect(typeof getCardDragIcon('callout')).toBe('function')
  })

  it('getDataset includes callout text editor state', async () => {
    await updateEditor(editor, () => {
      const node = $createCalloutNode({ calloutText: 'Important!' })
      const dataset = node.getDataset()

      expect(dataset.calloutText).toBe('Important!')
      expect(dataset.calloutTextEditor).toBeDefined()
      expect(dataset.calloutTextEditorInitialState).toBeDefined()
    })
  })

  it('exports callout text as html when a text editor exists', async () => {
    await updateEditor(editor, () => {
      const node = $createCalloutNode({})
      node.__calloutTextEditor = createHeadlessEditor({
        nodes: editorNodes,
        onError: () => {},
      })

      node.__calloutTextEditor.update(
        () => {
          const root = $getRoot()
          root.clear()
          const paragraph = $createParagraphNode()
          paragraph.append($createTextNode('Callout body'))
          root.append(paragraph)
        },
        // discrete: the exportJSON below reads the committed state synchronously (0.52+ defers non-discrete commits)
        { discrete: true },
      )

      const json = node.exportJSON() as Record<string, unknown>
      expect(json.calloutText).toContain('Callout body')
    })
  })
})
