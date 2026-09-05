import { createHeadlessEditor } from '@lexical/headless'
import { $createParagraphNode, $createTextNode, $getRoot, type EditorConfig, type LexicalEditor } from 'lexical'
import { beforeEach, describe, expect, it } from 'vitest'

import { updateEditor } from '#/utils/test-editor'
import { AsideNode, $createAsideNode, $isAsideNode } from '@/nodes/AsideNode'

const editorNodes = [AsideNode]
const asideEditorConfig: EditorConfig = {
  namespace: 'test',
  theme: { aside: 'inkling-aside' },
}

describe('AsideNode', () => {
  let editor: LexicalEditor

  beforeEach(() => {
    editor = createHeadlessEditor({ nodes: editorNodes, onError: () => {} })
  })

  it('matches node with $isAsideNode', async () => {
    await updateEditor(editor, () => {
      const asideNode = $createAsideNode()
      expect($isAsideNode(asideNode)).toBe(true)
    })
  })

  it('creates an aside DOM element with the theme class', async () => {
    await updateEditor(editor, () => {
      const asideNode = $createAsideNode()
      const element = asideNode.createDOM(asideEditorConfig)

      expect(element.tagName).toBe('ASIDE')
      expect(element.className).toBe('inkling-aside')
    })
  })

  it('inserts a new paragraph after the aside', async () => {
    await updateEditor(editor, () => {
      const asideNode = $createAsideNode()
      $getRoot().append(asideNode)

      const newBlock = asideNode.insertNewAfter()
      expect(newBlock.getType()).toBe('paragraph')
      expect(newBlock.getParent()).toBe($getRoot())
    })
  })

  it('collapses the aside into a paragraph containing its children', async () => {
    await updateEditor(editor, () => {
      const asideNode = $createAsideNode()
      const paragraph = $createParagraphNode()
      paragraph.append($createTextNode('Hello'))
      asideNode.append(paragraph)
      $getRoot().append(asideNode)

      const result = asideNode.collapseAtStart()
      expect(result).toBe(true)
      expect($isAsideNode($getRoot().getFirstChild())).toBe(false)
      expect($getRoot().getFirstChildOrThrow().getTextContent()).toBe('Hello')
    })
  })
})
