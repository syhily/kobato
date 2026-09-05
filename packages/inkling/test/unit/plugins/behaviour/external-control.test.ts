import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isParagraphNode,
  $isRangeSelection,
  createEditor,
  type LexicalEditor,
} from 'lexical'
import { beforeEach, describe, expect, it } from 'vitest'

import { tick, updateEditor } from '#/utils/test-editor'
import { $createHorizontalRuleNode, HorizontalRuleNode } from '@/nodes/HorizontalRuleNode'
import { focusEditorAt, insertParagraphAt, lastNodeIsDecorator } from '@/plugins/behaviour/external-control'

describe('external-control', () => {
  let editor: LexicalEditor

  beforeEach(() => {
    const rootElement = document.createElement('div')
    document.body.appendChild(rootElement)
    editor = createEditor({
      namespace: 'test',
      nodes: [HorizontalRuleNode],
      onError: (error) => {
        throw error
      },
    })
    editor.setRootElement(rootElement)
  })

  it('insertParagraphAt top inserts before the first child and selects it', async () => {
    await updateEditor(editor, () => {
      const paragraph = $createParagraphNode()
      paragraph.append($createTextNode('body'))
      $getRoot().append(paragraph)
    })

    insertParagraphAt(editor, 'top')
    await tick()

    editor.getEditorState().read(() => {
      const children = $getRoot().getChildren()
      expect(children).toHaveLength(2)
      expect($isParagraphNode(children[0])).toBe(true)
      expect(children[0].getTextContent()).toBe('')
      expect(children[1].getTextContent()).toBe('body')
    })
  })

  it('insertParagraphAt top appends into an empty document', async () => {
    insertParagraphAt(editor, 'top', { focus: false })
    await tick()

    editor.getEditorState().read(() => {
      expect($getRoot().getChildren()).toHaveLength(1)
    })
  })

  it('insertParagraphAt bottom appends after the last child', async () => {
    await updateEditor(editor, () => {
      $getRoot().append($createParagraphNode())
    })

    insertParagraphAt(editor, 'bottom')
    await tick()

    editor.getEditorState().read(() => {
      expect($getRoot().getChildren()).toHaveLength(2)
    })
  })

  it('lastNodeIsDecorator reports the last top-level node', async () => {
    await updateEditor(editor, () => {
      $getRoot().append($createParagraphNode())
    })
    expect(lastNodeIsDecorator(editor)).toBe(false)

    await updateEditor(editor, () => {
      $getRoot().append($createHorizontalRuleNode())
    })
    expect(lastNodeIsDecorator(editor)).toBe(true)
  })

  it('focusEditorAt bottom selects the last child when it is not a decorator', async () => {
    await updateEditor(editor, () => {
      const paragraph = $createParagraphNode()
      paragraph.append($createTextNode('body'))
      $getRoot().append(paragraph)
    })

    focusEditorAt(editor, { position: 'bottom' })
    await tick()

    editor.getEditorState().read(() => {
      const selection = $getSelection()
      expect($isRangeSelection(selection)).toBe(true)
      // the paragraph's own select() ran: the range covers its text
      expect(selection?.getNodes().some((node) => node.getTextContent() === 'body')).toBe(true)
    })
  })
})
