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

import { $isInklingCard } from '@/nodes/base'
import { $isAtStartOfDocument, $selectDecoratorNode } from '@/utils'
import { $ensureParagraphAfterCard } from '@/utils/$ensureParagraphAfterCard'

import type { KeyboardNavigationDeps } from './types'

import { $getLogicallyAdjacentCard, $getVisuallyAdjacentCard, editorOwnsFocus } from '../card-adjacency'
import { $extendSelectionAcrossCardBoundary, $selectCardFromCaptionArrow } from './selection-extension'

// The vertical-arrow pair shares one skeleton — shift-selection extension,
// the caption-arrow gate, the focus gate, the node-selection sibling walk,
// the collapsed-range visual probe (the same genus selection-extension
// merged for the shift-arrow pair). The directions diverge in exactly two
// one-sided policies, kept as data per direction:
// - up exits the editor at the document start (cursorDidExitAtTop), from
//   both the node-selection and the collapsed-range shapes;
// - down ensures a trailing paragraph after a doc-end card.
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

      // if a selection is being made, we need to handle it ourselves (lexical does not handle decorator nodes at this time)
      if (event.shiftKey) {
        if ($isRangeSelection(selection)) {
          return $extendSelectionAcrossCardBoundary(direction, selection, event)
        }
        // use default behavior for other selection
        return false
      }

      // if we're in a nested editor, we need to move selection back to the parent editor
      const { selectedCardKey } = store.getState()
      if ($selectCardFromCaptionArrow(editor, selectedCardKey, event)) {
        return true
      }

      // avoid processing card behaviours when an inner element has focus (e.g. nested editors)
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
          // up-only: leave the editor at the document start
          if (isUp && cursorDidExitAtTop) {
            selection.clear()
            cursorDidExitAtTop()
            return true
          }
          // down-only: create a new paragraph and select it if the selected card is at end of document
          if (!isUp) {
            $ensureParagraphAfterCard(currentNode, { select: true })
            return true
          }
        }

        // if the sibling is a card, select it (default Lexical behaviour skips over cards)
        const adjacentCard = $getLogicallyAdjacentCard(logicalDirection, currentNode)
        if (adjacentCard) {
          $selectDecoratorNode(adjacentCard)
          return true
        }

        // move cursor to the sibling's near edge
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
          // up-only: leave the editor at the document start
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
      // avoid processing card behaviours when an inner element has focus
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
      // non-card selections resolve their top-level element; cards resolve themselves
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
      // avoid processing card behaviours when an inner element has focus
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

      // cards resolve themselves; other selections resolve their top-level element
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
