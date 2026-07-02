import type { ElementNode } from 'lexical'

import { $getRoot, $getSelection, $isNodeSelection } from 'lexical'
import { describe, expect, it } from 'vitest'

import { buildHeadlessArticleEditor, readEditorState, seedParagraph } from '#/_helpers/headless-editor'
import { safeValidateInklingDocument } from '@/shared/inkling/schema'
import { $insertBlockCard, INKLING_CARD_MENU_ITEMS } from '@/ui/inkling/editor/cards/card-registry'
import { editorStateToInklingDocument } from '@/ui/inkling/editor/serialize'

/**
 * Card-menu insertion contract: every card registered in
 * `INKLING_CARD_MENU_ITEMS` (the single registry the vendored slash/plus
 * menus and `CardInsertPlugin` derive their entries from) must, when inserted
 * through `$insertBlockCard`, produce
 *   1. a node of the item's `type` in the serialized root,
 *   2. a trailing paragraph after it (caret landing spot), and
 *   3. a document that passes `safeValidateInklingDocument` — i.e. the seed
 *      payload each `createNode` factory uses is schema-valid on its own.
 */
describe('ui/inkling/editor/cards/card-insert', () => {
  it('registers all eight cards in the menu registry', () => {
    expect(INKLING_CARD_MENU_ITEMS.map((item) => item.type)).toEqual([
      'image-card',
      'code-block',
      'math-block',
      'music-card',
      'horizontal-rule',
      'table',
      'solution',
      'two-column',
    ])
  })

  for (const item of INKLING_CARD_MENU_ITEMS) {
    it(`inserts a ${item.type} card followed by a trailing paragraph`, () => {
      const editor = buildHeadlessArticleEditor((error) => {
        throw error
      })

      editor.update(
        () => {
          $insertBlockCard(item.createNode)
        },
        { discrete: true },
      )

      const serialized = editor.getEditorState().toJSON()
      const children = serialized.root.children
      expect(children[0]?.type).toBe(item.type)
      expect(children[1]?.type).toBe('paragraph')

      const document = editorStateToInklingDocument(editor.getEditorState())
      const validation = safeValidateInklingDocument(document)
      expect(validation.ok).toBe(true)
    })
  }

  it('inserts after an existing paragraph and node-selects the new card', () => {
    const item = INKLING_CARD_MENU_ITEMS.find((candidate) => candidate.type === 'code-block')
    expect(item).toBeDefined()
    if (item === undefined) {
      return
    }

    const editor = buildHeadlessArticleEditor((error) => {
      throw error
    })
    seedParagraph(editor, '插入位置之前的文本')

    editor.update(
      () => {
        // Caret at the end of the seeded paragraph — the position the slash
        // menu leaves the selection in before dispatching the insert command.
        const paragraph = $getRoot().getLastChildOrThrow<ElementNode>()
        paragraph.selectEnd()
        $insertBlockCard(item.createNode)
      },
      { discrete: true },
    )

    // The inserted card must be node-selected so the card chrome (outline,
    // toolbar, edit controls) appears immediately after insertion.
    const selectionIsCard = readEditorState(editor, () => {
      const selection = $getSelection()
      if (!$isNodeSelection(selection)) {
        return false
      }
      const nodes = selection.getNodes()
      return nodes.length === 1 && nodes[0]?.getType() === 'code-block'
    })
    expect(selectionIsCard).toBe(true)

    const serialized = editor.getEditorState().toJSON()
    const types = serialized.root.children.map((child) => child.type)
    expect(types).toContain('code-block')
    // Trailing-paragraph guarantee: the card is never the last root child.
    expect(types[types.length - 1]).toBe('paragraph')

    const document = editorStateToInklingDocument(editor.getEditorState())
    expect(safeValidateInklingDocument(document).ok).toBe(true)
    // The seeded prose survives the insertion.
    expect(JSON.stringify(document)).toContain('插入位置之前的文本')
  })
})
