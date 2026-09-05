import { $createLinkNode, LinkNode } from '@lexical/link'
import {
  $createParagraphNode,
  $createTextNode,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isParagraphNode,
  $isRangeSelection,
  createEditor,
  type LexicalEditor,
} from 'lexical'
import { beforeEach, describe, expect, it } from 'vitest'

import { updateEditor } from '#/utils/test-editor'
import { $createBookmarkNode, BookmarkNode } from '@/nodes/BookmarkNode'
import { $replaceCardWithParagraph } from '@/plugins/behaviour/card-removal'

// One card type is enough to exercise the surgery in jsdom (the same
// approach as the drop-surgery tests).
function createTestEditor(): LexicalEditor {
  return createEditor({ namespace: 'test', nodes: [BookmarkNode, LinkNode], onError: () => {} })
}

describe('$replaceCardWithParagraph', () => {
  let editor: LexicalEditor
  let cardKey: string

  beforeEach(async () => {
    editor = createTestEditor()
    await updateEditor(editor, () => {
      const card = $createBookmarkNode({ url: 'https://example.com' })
      $getRoot().append(card)
      cardKey = card.getKey()
    })
  })

  it('replaces the card with a fresh empty paragraph and selects its end', async () => {
    await updateEditor(editor, () => {
      $replaceCardWithParagraph(cardKey)
    })

    editor.getEditorState().read(() => {
      const root = $getRoot()
      expect(root.getChildrenSize()).toBe(1)
      const only = root.getFirstChild()
      expect($isParagraphNode(only)).toBe(true)
      expect(only?.getTextContent()).toBe('')
      const selection = $getSelection()
      expect($isRangeSelection(selection) && selection.anchor.key === only?.getKey()).toBe(true)
    })
  })

  it('appends the content node to the replacement paragraph (paste-as-link)', async () => {
    await updateEditor(editor, () => {
      $replaceCardWithParagraph(cardKey, {
        content: $createLinkNode('https://example.com').append($createTextNode('https://example.com')),
      })
    })

    editor.getEditorState().read(() => {
      const only = $getRoot().getFirstChild()
      expect($isParagraphNode(only)).toBe(true)
      expect(only?.getTextContent()).toBe('https://example.com')
    })
  })

  it('reuses an empty paragraph sibling instead of creating a second paragraph', async () => {
    let siblingKey = ''
    await updateEditor(editor, () => {
      const sibling = $createParagraphNode()
      $getRoot().append(sibling)
      siblingKey = sibling.getKey()
    })

    await updateEditor(editor, () => {
      $replaceCardWithParagraph(cardKey, { reuseEmptySibling: true })
    })

    editor.getEditorState().read(() => {
      const root = $getRoot()
      expect(root.getChildrenSize()).toBe(1)
      expect(root.getFirstChild()?.getKey()).toBe(siblingKey)
      const selection = $getSelection()
      expect($isRangeSelection(selection) && selection.anchor.key === siblingKey).toBe(true)
    })
  })

  it('creates a fresh paragraph when the next sibling has content', async () => {
    await updateEditor(editor, () => {
      $getRoot().append($createParagraphNode().append($createTextNode('keep me')))
    })

    await updateEditor(editor, () => {
      $replaceCardWithParagraph(cardKey, { reuseEmptySibling: true })
    })

    editor.getEditorState().read(() => {
      const root = $getRoot()
      expect(root.getChildrenSize()).toBe(2)
      const first = root.getFirstChild()
      expect($isParagraphNode(first)).toBe(true)
      expect(first?.getTextContent()).toBe('')
      expect(root.getLastChild()?.getTextContent()).toBe('keep me')
    })
  })

  it('is a no-op for a missing node', async () => {
    await updateEditor(editor, () => {
      $replaceCardWithParagraph('missing-key')
    })

    editor.getEditorState().read(() => {
      expect($getNodeByKey(cardKey)).not.toBeNull()
    })
  })
})
