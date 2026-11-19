import type { KeyboardNavigationDeps } from '@kobato/inkling-internal/plugins/behaviour/keyboard-navigation/types'

import { $isInklingCard } from '@kobato/inkling-internal/nodes/base'
import {
  $getLogicallyAdjacentCard,
  $getVisuallyAdjacentCard,
  editorOwnsFocus,
} from '@kobato/inkling-internal/plugins/behaviour/card-adjacency'
import {
  $extendSelectionAcrossCardBoundary,
  $selectCardFromCaptionArrow,
} from '@kobato/inkling-internal/plugins/behaviour/keyboard-navigation/selection-extension'
import { $isAtStartOfDocument, $selectDecoratorNode } from '@kobato/inkling-internal/utils'
import { $ensureParagraphAfterCard } from '@kobato/inkling-internal/utils/$ensureParagraphAfterCard'
import {
  type LexicalEditor,
  $getSelection,
  $isNodeSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_LEFT_COMMAND,
  KEY_ARROW_RIGHT_COMMAND,
  KEY_ARROW_UP_COMMAND,
  type LexicalCommand,
} from 'lexical'

function registerVerticalArrowCommand(
  editor: LexicalEditor,
  deps: KeyboardNavigationDeps,
  {
    command,
    direction,
    logicalDirection,
  }: {
    command: LexicalCommand<KeyboardEvent>
    direction: 'up' | 'down'
    logicalDirection: 'previous' | 'next'
  },
): () => void {
  const { store, cursorDidExitAtTop } = deps
  const isUp = direction === 'up'

  return editor.registerCommand(
    command,
    (event) => {
      const selection = $getSelection()

      // Lexical does not extend selections over decorator nodes.
      if (event.shiftKey) {
        if ($isRangeSelection(selection)) {
          return $extendSelectionAcrossCardBoundary(direction, selection, event)
        }
        return false
      }

      const { selectedCardKey } = store.getState()
      if ($selectCardFromCaptionArrow(editor, selectedCardKey, event)) {
        return true
      }

      if (!editorOwnsFocus(editor)) {
        return true
      }

      if ($isNodeSelection(selection)) {
        const currentNode = selection.getNodes()[0]
        if (!currentNode) {
          return false
        }
        const sibling = isUp ? currentNode.getPreviousSibling() : currentNode.getNextSibling()

        if (!sibling) {
          if (isUp && cursorDidExitAtTop) {
            selection.clear()
            cursorDidExitAtTop()
            return true
          }
          if (!isUp) {
            $ensureParagraphAfterCard(currentNode, { select: true })
            return true
          }
        }

        // Default Lexical behaviour skips over cards.
        const adjacentCard = $getLogicallyAdjacentCard(logicalDirection, currentNode)
        if (adjacentCard) {
          $selectDecoratorNode(adjacentCard)
          return true
        }

        event.preventDefault()
        if (isUp) {
          sibling?.selectEnd()
        } else {
          sibling?.selectStart()
        }
        return true
      }

      if ($isRangeSelection(selection)) {
        if (selection.isCollapsed()) {
          if (isUp && cursorDidExitAtTop && $isAtStartOfDocument(selection)) {
            cursorDidExitAtTop()
            return true
          }

          const adjacentCard = $getVisuallyAdjacentCard(direction)
          if (adjacentCard) {
            $selectDecoratorNode(adjacentCard)
            return true
          }
        }
      }

      return false
    },
    COMMAND_PRIORITY_LOW,
  )
}

export function registerArrowUpCommand(editor: LexicalEditor, deps: KeyboardNavigationDeps): () => void {
  return registerVerticalArrowCommand(editor, deps, {
    command: KEY_ARROW_UP_COMMAND,
    direction: 'up',
    logicalDirection: 'previous',
  })
}

export function registerArrowDownCommand(editor: LexicalEditor, deps: KeyboardNavigationDeps): () => void {
  return registerVerticalArrowCommand(editor, deps, {
    command: KEY_ARROW_DOWN_COMMAND,
    direction: 'down',
    logicalDirection: 'next',
  })
}

export function registerArrowLeftCommand(editor: LexicalEditor, deps: KeyboardNavigationDeps): () => void {
  const { cursorDidExitAtTop } = deps

  return editor.registerCommand(
    KEY_ARROW_LEFT_COMMAND,
    (event) => {
      if (!editorOwnsFocus(editor)) {
        return true
      }

      const selection = $getSelection()

      if (cursorDidExitAtTop) {
        if ($isNodeSelection(selection)) {
          const currentNode = selection.getNodes()[0]
          if (!currentNode) {
            return false
          }
          const previousSibling = currentNode.getPreviousSibling()

          if (!previousSibling) {
            event.preventDefault()
            selection.clear()
            cursorDidExitAtTop()
            return true
          }
        } else if (selection && $isAtStartOfDocument(selection)) {
          event.preventDefault()
          cursorDidExitAtTop()
          return true
        }
      }

      if (!$isNodeSelection(selection)) {
        return false
      }

      const firstNode = selection.getNodes()[0]
      if (!firstNode) {
        return false
      }
      const referenceNode = $isInklingCard(firstNode) ? firstNode : firstNode.getTopLevelElement()
      const previousCard = referenceNode ? $getLogicallyAdjacentCard('previous', referenceNode) : null

      if (previousCard) {
        event.preventDefault()
        $selectDecoratorNode(previousCard)
        return true
      }

      return false
    },
    COMMAND_PRIORITY_LOW,
  )
}

export function registerArrowRightCommand(editor: LexicalEditor, _deps: KeyboardNavigationDeps): () => void {
  return editor.registerCommand(
    KEY_ARROW_RIGHT_COMMAND,
    (event) => {
      if (!editorOwnsFocus(editor)) {
        return true
      }

      const selection = $getSelection()

      if (!$isNodeSelection(selection)) {
        return false
      }

      const selectedNodes = selection.getNodes()
      const lastNode = selectedNodes[selectedNodes.length - 1]
      if (!lastNode) {
        return false
      }

      const referenceNode = $isInklingCard(lastNode) ? lastNode : lastNode.getTopLevelElement()
      const nextCard = referenceNode ? $getLogicallyAdjacentCard('next', referenceNode) : null

      if (nextCard) {
        event.preventDefault()
        $selectDecoratorNode(nextCard)
        return true
      }

      return false
    },
    COMMAND_PRIORITY_LOW,
  )
}
