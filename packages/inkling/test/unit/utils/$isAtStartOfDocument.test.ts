import { createHeadlessEditor } from '@lexical/headless'
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $setSelection,
  type LexicalEditor,
} from 'lexical'
import { beforeEach, describe, expect, it } from 'vitest'

import { updateEditor } from '#/utils/test-editor'
import { $isAtStartOfDocument } from '@/utils/$isAtStartOfDocument'

describe('$isAtStartOfDocument', () => {
  let editor: LexicalEditor

  beforeEach(() => {
    editor = createHeadlessEditor({ onError: () => {} })
  })

  it('returns true when the caret is at the start of the document', async () => {
    await updateEditor(editor, () => {
      const root = $getRoot()
      root.clear()
      const paragraph = $createParagraphNode()
      paragraph.append($createTextNode('Hello world'))
      root.append(paragraph)

      paragraph.select(0, 0)
      const selection = $getSelection()
      if (!selection) {
        throw new Error('Expected paragraph.select to create a selection')
      }
      expect($isAtStartOfDocument(selection)).toBe(true)
    })
  })

  it('returns false when the caret is not at the start', async () => {
    await updateEditor(editor, () => {
      const root = $getRoot()
      root.clear()
      const paragraph = $createParagraphNode()
      paragraph.append($createTextNode('Hello world'))
      root.append(paragraph)

      paragraph.select(2, 2)
      const selection = $getSelection()
      if (!selection) {
        throw new Error('Expected paragraph.select to create a selection')
      }
      expect($isAtStartOfDocument(selection)).toBe(false)
    })
  })

  it('returns true for a node selection at the first node', async () => {
    await updateEditor(editor, () => {
      const root = $getRoot()
      root.clear()
      const paragraph = $createParagraphNode()
      paragraph.append($createTextNode('Hello'))
      root.append(paragraph)

      const nodeSelection = paragraph.select()
      $setSelection(nodeSelection)

      expect($isAtStartOfDocument(nodeSelection)).toBe(true)
    })
  })
})
