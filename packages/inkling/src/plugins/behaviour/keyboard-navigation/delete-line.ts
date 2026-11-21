import type { KeyboardNavigationDeps } from '@kobato/inkling-internal/plugins/behaviour/keyboard-navigation/types'
import type { LexicalEditor } from 'lexical'

import {
  $getLogicallyAdjacentCard,
  $isCaretAtBlockTop,
  dispatchSelectedCardDeletion,
} from '@kobato/inkling-internal/plugins/behaviour/card-adjacency'
import { $selectDecoratorNode } from '@kobato/inkling-internal/utils'
import { $getSelection, $isRangeSelection, COMMAND_PRIORITY_LOW, DELETE_LINE_COMMAND } from 'lexical'

export function registerDeleteLineCommand(editor: LexicalEditor, deps: KeyboardNavigationDeps): () => void {
  const { store, isNested } = deps

  return editor.registerCommand(
    DELETE_LINE_COMMAND,
    (isBackward) => {
      if (dispatchSelectedCardDeletion(editor, store, isNested, isBackward ? 'backward' : 'forward')) {
        return true
      }

      const selection = $getSelection()
      if ($isRangeSelection(selection)) {
        if (selection.isCollapsed()) {
          const anchor = selection.anchor
          const anchorNode = anchor.getNode()
          const topLevelElement = anchorNode.getTopLevelElement()
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
