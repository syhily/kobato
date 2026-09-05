import type { LexicalEditor } from 'lexical'

import { $getSelection, $isRangeSelection, COMMAND_PRIORITY_LOW, DELETE_LINE_COMMAND } from 'lexical'

import { $selectDecoratorNode } from '@/utils'

import type { KeyboardNavigationDeps } from './types'

import { $getLogicallyAdjacentCard, $isCaretAtBlockTop, dispatchSelectedCardDeletion } from '../card-adjacency'

export function registerDeleteLineCommand(editor: LexicalEditor, deps: KeyboardNavigationDeps): () => void {
  const { store, isNested } = deps

  return editor.registerCommand(
    DELETE_LINE_COMMAND,
    (isBackward) => {
      // delete selected card if it's not a nested editor (the shared gate
      // owns the focus guard; the payload is a direction boolean, so there
      // is no event to preventDefault here)
      if (dispatchSelectedCardDeletion(editor, store, isNested, isBackward ? 'backward' : 'forward')) {
        return true
      }

      // Avoid deleting a card accidentally:
      // If a paragraph is on the first visual line and adjacent to a card,
      // Lexical's default DELETE_LINE behaviour can pull the card in. For backward
      // deletion we delete from the paragraph start to the caret, preserving any
      // text after the caret and later lines; we only remove the block and select
      // the card when the paragraph becomes empty. Forward deletion beside a
      // following card removes the whole block and selects the card.
      const selection = $getSelection()
      if ($isRangeSelection(selection)) {
        if (selection.isCollapsed()) {
          const anchor = selection.anchor
          const anchorNode = anchor.getNode()
          const topLevelElement = anchorNode.getTopLevelElement()
          // from-mode lookup: ungated on caret offsets — the first-line
          // verdict below is the gate, and it is direction-independent
          const sibling = topLevelElement
            ? $getLogicallyAdjacentCard(isBackward ? 'previous' : 'next', topLevelElement)
            : null

          // Find out if the paragraph contains only one line
          const isFirstLine = $isCaretAtBlockTop()

          if (sibling && isFirstLine) {
            if (!topLevelElement) {
              return false
            }
            if (isBackward) {
              // Delete from the paragraph start to the caret, preserving any text
              // after the caret and any later lines. If the paragraph becomes empty,
              // remove it and select the adjacent card.
              anchor.set(topLevelElement.getKey(), 0, 'element')
              selection.removeText()
              if (topLevelElement.getChildrenSize() === 0) {
                topLevelElement.remove()
                $selectDecoratorNode(sibling)
              }
            } else {
              // Forward delete-line beside a following card: remove the whole block
              // and select the card. The existing E2E coverage only exercises the
              // one-line case; multi-line forward deletion can be added separately.
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
