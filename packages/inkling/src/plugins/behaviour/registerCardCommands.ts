import type { LexicalEditor, LexicalNode } from 'lexical'

import { mergeRegister } from '@lexical/utils'
import { $getNodeByKey, $getSelection, $isNodeSelection, $isRangeSelection, COMMAND_PRIORITY_LOW } from 'lexical'

import { $isInklingCard } from '@/nodes/base'
import { $ensureParagraphAfterCard } from '@/utils/$ensureParagraphAfterCard'
import { $insertAndSelectNode } from '@/utils/$insertAndSelectNode'

import type { CardSelectionStore } from './cardSelectionStore'

import { $deselectCard, $getLogicallyAdjacentCard, $selectCard, focusEditorRoot } from './card-adjacency'
import {
  DELETE_CARD_COMMAND,
  DESELECT_CARD_COMMAND,
  EDIT_CARD_COMMAND,
  INSERT_CARD_COMMAND,
  SELECT_CARD_COMMAND,
} from './commands'

interface CardCommandDeps {
  store: CardSelectionStore
}

export function registerCardCommands(editor: LexicalEditor, deps: CardCommandDeps) {
  const { store } = deps

  return mergeRegister(
    editor.registerCommand(
      INSERT_CARD_COMMAND,
      ({ cardNode, openInEditMode }) => {
        const selection = $getSelection()
        if (!$isRangeSelection(selection) && !$isNodeSelection(selection)) {
          return false
        }
        // focus.getNode() is non-null (it throws on a missing node); an empty
        // NodeSelection has no first node, so bail out before using it
        const focusNode: LexicalNode | undefined = $isRangeSelection(selection)
          ? selection.focus.getNode()
          : selection.getNodes()[0]
        if (!focusNode) {
          return false
        }

        $insertAndSelectNode({ selectedNode: focusNode, newNode: cardNode })

        store.setState({ selectedCardKey: cardNode.getKey() })

        if (openInEditMode) {
          store.setState({ isEditingCard: true })
        }

        return true
      },
      COMMAND_PRIORITY_LOW,
    ),
    editor.registerCommand(
      SELECT_CARD_COMMAND,
      ({ cardKey }) => {
        const { selectedCardKey, isEditingCard } = store.getState()

        // already selected, delete if empty as we're exiting edit mode
        if (selectedCardKey === cardKey && isEditingCard) {
          const cardNode = $getNodeByKey(cardKey)
          if (cardNode && $isInklingCard(cardNode) && cardNode.isEmpty?.()) {
            editor.dispatchCommand(DELETE_CARD_COMMAND, { cardKey })
            return true
          }
        }

        if (selectedCardKey && selectedCardKey !== cardKey) {
          $deselectCard(editor, selectedCardKey)
        }

        $selectCard(editor, cardKey)

        store.setState({ selectedCardKey: cardKey, isEditingCard: false })
        return true
      },
      COMMAND_PRIORITY_LOW,
    ),
    editor.registerCommand(
      EDIT_CARD_COMMAND,
      ({ cardKey }) => {
        const { selectedCardKey } = store.getState()

        if (selectedCardKey && selectedCardKey !== cardKey) {
          $deselectCard(editor, selectedCardKey)
        }
        $selectCard(editor, cardKey)

        store.setState({ selectedCardKey: cardKey })

        const cardNode = $getNodeByKey(cardKey)
        if (cardNode && $isInklingCard(cardNode) && cardNode.hasEditMode()) {
          store.setState({ isEditingCard: true })
        }
        return true
      },
      COMMAND_PRIORITY_LOW,
    ),
    editor.registerCommand(
      DESELECT_CARD_COMMAND,
      ({ cardKey }) => {
        $deselectCard(editor, cardKey)

        store.setState({ selectedCardKey: null, isEditingCard: false })
        return true
      },
      COMMAND_PRIORITY_LOW,
    ),
    editor.registerCommand(
      DELETE_CARD_COMMAND,
      ({ cardKey, direction = 'forward' }) => {
        const cardNode = $getNodeByKey(cardKey)
        if (!cardNode) {
          return false
        }
        const previousSibling = cardNode.getPreviousSibling()
        const nextSibling = cardNode.getNextSibling()

        if (direction === 'backward' && previousSibling) {
          // from-mode: cardNode comes from the payload, not the selection
          const previousCard = $getLogicallyAdjacentCard('previous', cardNode)
          if (previousCard) {
            $selectCard(editor, previousCard, { focus: 'always' })
          } else {
            previousSibling.selectEnd()
          }
        } else if (nextSibling) {
          // from-mode: cardNode comes from the payload, not the selection
          const nextCard = $getLogicallyAdjacentCard('next', cardNode)
          if (nextCard) {
            $selectCard(editor, nextCard, { focus: 'always' })
          } else {
            nextSibling.selectStart()
          }
        } else {
          // ensure we still have a paragraph if the deleted card was the only node
          $ensureParagraphAfterCard(cardNode, { select: true })
        }

        cardNode.remove()

        // caret-selection paths: focus moves back to the editor by hand
        // ($selectCard's 'always' leg already repaired it on the card paths;
        // a second focus on the active element is a no-op)
        focusEditorRoot(editor)

        store.setState({ selectedCardKey: null, isEditingCard: false })
        return true
      },
      COMMAND_PRIORITY_LOW,
    ),
  )
}
