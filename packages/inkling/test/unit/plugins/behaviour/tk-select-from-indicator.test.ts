import { $createParagraphNode, $getRoot, $getSelection, $isRangeSelection, type LexicalEditor } from 'lexical'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createTestEditor, updateEditor } from '#/utils/test-editor'
import { $createTKNode, TKNode } from '@/nodes/base'
import { $createHorizontalRuleNode, HorizontalRuleNode } from '@/nodes/HorizontalRuleNode'
import { SELECT_CARD_COMMAND } from '@/plugins/behaviour/commands'
import { $selectTkFromIndicator } from '@/plugins/behaviour/tk-tracking'

describe('$selectTkFromIndicator', () => {
  let editor: LexicalEditor

  function mount(editor: LexicalEditor) {
    // a root element keeps the selection alive across separate updates
    editor.setRootElement(document.createElement('div'))
  }

  it('dispatches SELECT_CARD_COMMAND when the parent is a card', async () => {
    editor = createTestEditor({ nodes: [HorizontalRuleNode], headless: false })
    mount(editor)
    const dispatchSpy = vi.spyOn(editor, 'dispatchCommand')
    let cardKey = ''

    await updateEditor(editor, () => {
      const rule = $createHorizontalRuleNode()
      $getRoot().append(rule)
      cardKey = rule.getKey()
    })

    editor.update(() => {
      $selectTkFromIndicator(editor, cardKey, [])
    })

    expect(dispatchSpy).toHaveBeenCalledWith(SELECT_CARD_COMMAND, { cardKey })
  })

  describe('with two TK nodes in a paragraph', () => {
    let paragraphKey = ''
    let firstKey = ''
    let secondKey = ''
    let firstNode: TKNode

    beforeEach(async () => {
      editor = createTestEditor({ nodes: [TKNode], headless: false })
      mount(editor)
      await updateEditor(editor, () => {
        const paragraph = $createParagraphNode()
        const first = $createTKNode('FIXME')
        const second = $createTKNode('TODO')
        paragraphKey = paragraph.getKey()
        firstKey = first.getKey()
        secondKey = second.getKey()
        firstNode = first
        paragraph.append(first, second)
        $getRoot().append(paragraph)
      })
    })

    it('selects the first TK node when none is currently selected', async () => {
      editor.update(() => {
        $selectTkFromIndicator(editor, paragraphKey, [firstKey, secondKey])

        const selection = $getSelection()
        expect($isRangeSelection(selection)).toBe(true)
        if ($isRangeSelection(selection)) {
          expect(selection.getNodes()[0].getKey()).toBe(firstKey)
          expect(selection.anchor.offset).toBe(0)
          expect(selection.focus.offset).toBe(5)
        }
      })
    })

    it('advances the selection to the next TK node', async () => {
      await updateEditor(editor, () => {
        // select the first TK node as the current position
        firstNode.select(0, 5)
      })

      editor.update(() => {
        $selectTkFromIndicator(editor, paragraphKey, [firstKey, secondKey])

        const selection = $getSelection()
        expect($isRangeSelection(selection)).toBe(true)
        if ($isRangeSelection(selection)) {
          expect(selection.getNodes()[0].getKey()).toBe(secondKey)
        }
      })
    })
  })
})
