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

import type { KeyboardNavigationDeps } from '@/inkling/plugins/behaviour/keyboard-navigation/types'

import { $isInklingCard } from '@/inkling/nodes/base'
import {
  $getLogicallyAdjacentCard,
  $getVisuallyAdjacentCard,
  editorOwnsFocus,
} from '@/inkling/plugins/behaviour/card-adjacency'
import {
  $extendSelectionAcrossCardBoundary,
  $selectCardFromCaptionArrow,
} from '@/inkling/plugins/behaviour/keyboard-navigation/selection-extension'
import { $isAtStartOfDocument, $selectDecoratorNode } from '@/inkling/utils'
import { $ensureParagraphAfterCard } from '@/inkling/utils/$ensureParagraphAfterCard'

// The vertical-arrow pair shares one skeleton; the directions diverge in two
// one-sided policies: up exits the editor at the document start
// (`cursorDidExitAtTop`), down ensures a trailing paragraph after a doc-end card.
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

      // A caption arrow in a nested editor moves selection back to the parent editor.
      const { selectedCardKey } = store.getState()
      if ($selectCardFromCaptionArrow(editor, selectedCardKey, event)) {
        return true
      }

      // Focus is inside an inner element (e.g. a nested editor): swallow the key.
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
          // `cursorDidExitAtTop` is up-only; document start clears the cursor.
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
      // Focus is inside an inner element (e.g. a nested editor): swallow the key.
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
      // Cards resolve themselves; other nodes resolve their top-level element.
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
      // Focus is inside an inner element (e.g. a nested editor): swallow the key.
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

      // Cards resolve themselves; other nodes resolve their top-level element.
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
