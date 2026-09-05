import {
  $createParagraphNode,
  $getRoot,
  $getSelection,
  $isParagraphNode,
  $isRangeSelection,
  createEditor,
  type LexicalEditor,
} from 'lexical'
import { beforeEach, describe, expect, it } from 'vitest'

import { updateEditor } from '#/utils/test-editor'
import { $createImageNode, ImageNode } from '@/nodes/ImageNode'
import { $ensureParagraphAfterCard } from '@/utils/$ensureParagraphAfterCard'

// One card type is enough to exercise the policy in jsdom (the same approach
// as the card-adjacency and snippet-insertion tests).
const TEST_NODES = [ImageNode]

function createTestEditor(): LexicalEditor {
  return createEditor({ namespace: 'test', nodes: TEST_NODES, onError: () => {} })
}

describe('$ensureParagraphAfterCard', () => {
  let editor: LexicalEditor

  beforeEach(() => {
    editor = createTestEditor()
  })

  it('appends a paragraph after a card that is the last top-level node', async () => {
    await updateEditor(editor, () => {
      const root = $getRoot()
      root.clear()
      root.append($createParagraphNode())
      const card = $createImageNode({ src: '/image.png' })
      root.append(card)

      const paragraph = $ensureParagraphAfterCard(card)

      expect(paragraph).toBeDefined()
      expect($isParagraphNode(card.getNextSibling())).toBe(true)
      expect(card.getNextSibling()?.is(paragraph)).toBe(true)
      // no selection requested — the policy leaves the selection alone
      expect($getSelection()).toBeNull()
    })
  })

  it('does nothing when the card has a next sibling', async () => {
    await updateEditor(editor, () => {
      const root = $getRoot()
      root.clear()
      const card = $createImageNode({ src: '/image.png' })
      root.append(card)
      const trailing = $createParagraphNode()
      root.append(trailing)

      expect($ensureParagraphAfterCard(card)).toBeUndefined()
      expect(card.getNextSibling()?.is(trailing)).toBe(true)
    })
  })

  it('selects the new paragraph when asked to', async () => {
    await updateEditor(editor, () => {
      const root = $getRoot()
      root.clear()
      const card = $createImageNode({ src: '/image.png' })
      root.append(card)

      const paragraph = $ensureParagraphAfterCard(card, { select: true })

      const selection = $getSelection()
      expect($isRangeSelection(selection)).toBe(true)
      if ($isRangeSelection(selection)) {
        expect(selection.anchor.getNode().is(paragraph)).toBe(true)
        expect(selection.anchor.offset).toBe(0)
      }
    })
  })

  it('returns undefined instead of throwing for a detached node', () => {
    // no mutation happens here, so this update never fires onUpdate — assert
    // synchronously inside the update instead of awaiting a commit
    editor.update(() => {
      const card = $createImageNode({ src: '/image.png' })
      expect($ensureParagraphAfterCard(card)).toBeUndefined()
    })
  })
})
