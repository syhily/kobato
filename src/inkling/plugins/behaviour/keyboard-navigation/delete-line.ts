import type { LexicalEditor } from 'lexical'

import { $getSelection, $isRangeSelection, COMMAND_PRIORITY_LOW, DELETE_LINE_COMMAND } from 'lexical'

import type { KeyboardNavigationDeps } from '@/inkling/plugins/behaviour/keyboard-navigation/types'

import {
  $getLogicallyAdjacentCard,
  $isCaretAtBlockTop,
  dispatchSelectedCardDeletion,
} from '@/inkling/plugins/behaviour/card-adjacency'
import { $selectDecoratorNode } from '@/inkling/utils'

export function registerDeleteLineCommand(editor: LexicalEditor, deps: KeyboardNavigationDeps): () => void {
  const { store, isNested } = deps

  return editor.registerCommand(
    DELETE_LINE_COMMAND,
    (isBackward) => {
      // The payload is a direction boolean, so there is no event to preventDefault.
      if (dispatchSelectedCardDeletion(editor, store, isNested, isBackward ? 'backward' : 'forward')) {
        return true
      }

      // Lexical's default DELETE_LINE can pull in a card adjacent to the first visual
      // line of a paragraph. On that one-line case: backward deletes from the paragraph
      // start to the caret (keeping later text and lines) and removes the block only
      // once empty; forward removes the whole block. Either then selects the card.
      const selection = $getSelection()
      if ($isRangeSelection(selection)) {
        if (selection.isCollapsed()) {
          const anchor = selection.anchor
          const anchorNode = anchor.getNode()
          const topLevelElement = anchorNode.getTopLevelElement()
          // Ungated on caret offsets: the first-line verdict below is the gate, and
          // it is direction-independent.
          const sibling = topLevelElement
            ? $getLogicallyAdjacentCard(isBackward ? 'previous' : 'next', topLevelElement)
            : null

          const isFirstLine = $isCaretAtBlockTop()

          if (sibling && isFirstLine) {
            if (!topLevelElement) {
              return false
            }
            if (isBackward) {
              anchor.set(topLevelElement.getKey(), 0, 'element')
              selection.removeText()
              if (topLevelElement.getChildrenSize() === 0) {
                topLevelElement.remove()
                $selectDecoratorNode(sibling)
              }
            } else {
              topLevelElement.remove()
              $selectDecoratorNode(sibling)
            }
            return true
          }
        }
      }

      return false
    },
    COMMAND_PRIORITY_LOW,
  )
}
