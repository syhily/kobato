import { createHeadlessEditor } from '@lexical/headless'
import { type LexicalEditor } from 'lexical'
import { beforeEach, describe, expect, it } from 'vitest'

import { attachCaptionEditorWithText } from '#/utils/caption-editor'
import { updateEditor } from '#/utils/test-editor'
import { getCardDragIcon } from '@/nodes/cards/card-menus'
import { CodeBlockNode, $createCodeBlockNode, $isCodeBlockNode } from '@/nodes/CodeBlockNode'

const editorNodes = [CodeBlockNode]

describe('CodeBlockNode', () => {
  let editor: LexicalEditor

  beforeEach(() => {
    editor = createHeadlessEditor({ nodes: editorNodes, onError: () => {} })
  })

  it('matches node with $isCodeBlockNode', async () => {
    await updateEditor(editor, () => {
      const node = $createCodeBlockNode({})
      expect($isCodeBlockNode(node)).toBe(true)
    })
  })

  it('resolves the code block drag icon despite having no cardMenu entry', () => {
    expect(typeof getCardDragIcon('codeblock')).toBe('function')
  })

  it('stores open in edit mode flag', async () => {
    await updateEditor(editor, () => {
      const node = $createCodeBlockNode({ _openInEditMode: true })
      expect(node.__openInEditMode).toBe(true)

      node.clearOpenInEditMode()
      expect(node.__openInEditMode).toBe(false)
    })
  })

  it('getDataset includes caption editor state', async () => {
    await updateEditor(editor, () => {
      const node = $createCodeBlockNode({ caption: 'A caption' })
      const dataset = node.getDataset()

      expect(dataset.caption).toBe('A caption')
      expect(dataset.captionEditor).toBeDefined()
      expect(dataset.captionEditorInitialState).toBeDefined()
    })
  })

  it('exports caption as html when a caption editor exists', async () => {
    await updateEditor(editor, () => {
      const node = $createCodeBlockNode({})
      attachCaptionEditorWithText(node)

      const json = node.exportJSON()
      if (!('caption' in json)) {
        throw new Error('Expected serialized code block to include caption')
      }
      expect(json.caption).toContain('Hello caption')
    })
  })
})
