import type { CardPickerStore } from '@kobato/inkling-internal/plugins/behaviour/card-picker-store'
import type { CardSelectionStore } from '@kobato/inkling-internal/plugins/behaviour/card-selection-store'
import type { LexicalEditor, LexicalNode } from 'lexical'

import { $isInklingCard } from '@kobato/inkling-internal/nodes/base'
import {
  $deselectCard,
  $getLogicallyAdjacentCard,
  $selectCard,
  focusEditorRoot,
} from '@kobato/inkling-internal/plugins/behaviour/card-adjacency'
import {
  DELETE_CARD_COMMAND,
  DESELECT_CARD_COMMAND,
  EDIT_CARD_COMMAND,
  INSERT_CARD_COMMAND,
  SELECT_CARD_COMMAND,
} from '@kobato/inkling-internal/plugins/behaviour/commands'
import { $ensureParagraphAfterCard } from '@kobato/inkling-internal/utils/$ensureParagraphAfterCard'
import { $insertAndSelectNode } from '@kobato/inkling-internal/utils/$insertAndSelectNode'
import { mergeRegister } from '@lexical/utils'
import { $getNodeByKey, $getSelection, $isNodeSelection, $isRangeSelection, COMMAND_PRIORITY_LOW } from 'lexical'

interface CardCommandDeps {
  store: CardSelectionStore
  pickerStore: CardPickerStore
}

export function registerCardCommands(editor: LexicalEditor, deps: CardCommandDeps) {
  const { store, pickerStore } = deps

  return mergeRegister(
    editor.registerCommand(
      INSERT_CARD_COMMAND,
      ({ cardNode, openInEditMode, openPicker }) => {
        const selection = $getSelection()
        if (!$isRangeSelection(selection) && !$isNodeSelection(selection)) {
          return false
        }
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

        if (openPicker) {
          pickerStore.setState({
            request: { nodeKey: cardNode.getKey(), nodeType: cardNode.getType(), fromInsert: true },
          })
        }

        return true
      },
      COMMAND_PRIORITY_LOW,
    ),
    editor.registerCommand(
      SELECT_CARD_COMMAND,
      ({ cardKey }) => {
        const { selectedCardKey, isEditingCard } = store.getState()

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
          const previousCard = $getLogicallyAdjacentCard('previous', cardNode)
          if (previousCard) {
            $selectCard(editor, previousCard, { focus: 'always' })
          } else {
            previousSibling.selectEnd()
          }
        } else if (nextSibling) {
          const nextCard = $getLogicallyAdjacentCard('next', cardNode)
          if (nextCard) {
            $selectCard(editor, nextCard, { focus: 'always' })
          } else {
            nextSibling.selectStart()
          }
        } else {
          $ensureParagraphAfterCard(cardNode, { select: true })
        }

        cardNode.remove()

        focusEditorRoot(editor)
        store.setState({ selectedCardKey: null, isEditingCard: false })
        return true
      },
      COMMAND_PRIORITY_LOW,
    ),
  )
}
