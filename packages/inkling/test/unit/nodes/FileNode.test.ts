import { createHeadlessEditor } from '@lexical/headless'
import { type LexicalEditor } from 'lexical'
import { beforeEach, describe, expect, it } from 'vitest'

import { getCardMenu } from '#/utils/card-menu'
import { updateEditor } from '#/utils/test-editor'
import { getCardDragIcon } from '@/nodes/cards/card-menus'
import { FileNode, $createFileNode, $isFileNode, INSERT_FILE_COMMAND } from '@/nodes/FileNode'

const editorNodes = [FileNode]

describe('FileNode', () => {
  let editor: LexicalEditor

  beforeEach(() => {
    editor = createHeadlessEditor({ nodes: editorNodes, onError: () => {} })
  })

  it('matches node with $isFileNode', async () => {
    await updateEditor(editor, () => {
      const node = $createFileNode({})
      expect($isFileNode(node)).toBe(true)
    })
  })

  it('resolves a card menu entry', () => {
    expect(getCardMenu('file')?.[0]?.label).toBe('File')
    expect(getCardMenu('file')?.[0]?.insertCommand).toBe(INSERT_FILE_COMMAND)
  })

  it('resolves the file drag icon from the card menu', () => {
    expect(typeof getCardDragIcon('file')).toBe('function')
  })

  it('sets __triggerFileDialog when no src is provided', async () => {
    await updateEditor(editor, () => {
      const node = $createFileNode({ triggerFileDialog: true })
      expect(node.__triggerFileDialog).toBe(true)
    })
  })

  it('stores the initial file', async () => {
    const file = new File(['content'], 'doc.pdf')
    await updateEditor(editor, () => {
      const node = $createFileNode({ initialFile: file })
      expect(node.__initialFile).toBe(file)
    })
  })
})
