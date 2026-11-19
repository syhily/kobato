import type { KeyboardNavigationDeps } from '@kobato/inkling-internal/plugins/behaviour/keyboard-navigation/types'
import type { LexicalEditor } from 'lexical'

import { $fireFenceKeyboardShortcut } from '@kobato/inkling-internal/markdown/card-shortcuts'
import { $isInklingCard } from '@kobato/inkling-internal/nodes/base'
import {
  $removeOrReplaceNodeWithParagraph,
  $selectCard,
  editorOwnsFocus,
} from '@kobato/inkling-internal/plugins/behaviour/card-adjacency'
import { getEventProvenance } from '@kobato/inkling-internal/plugins/behaviour/nested-editor-protocol'
import { $createParagraphNode, $getNodeByKey, COMMAND_PRIORITY_LOW, KEY_ENTER_COMMAND } from 'lexical'

export function registerEnterCommand(editor: LexicalEditor, deps: KeyboardNavigationDeps): () => void {
  const { store, isNested } = deps

  return editor.registerCommand(
    KEY_ENTER_COMMAND,
    (event) => {
      const { selectedCardKey, isEditingCard } = store.getState()

      if (selectedCardKey && event && (event.metaKey || event.ctrlKey)) {
        const cardNode = $getNodeByKey(selectedCardKey)

        if ($isInklingCard(cardNode) && cardNode.hasEditMode()) {
          event.preventDefault()

          // Leaving edit mode must move focus back to the editor: focus left on removed
          // elements swallows further key events.
          if (isEditingCard) {
            if (cardNode.isEmpty?.()) {
              // Root-first focus choreography lives in card-adjacency; selecting the next
              // block directly avoids KEY_ARROW_DOWN_COMMAND's bail-out while focus is
              // still inside the card's nested editor.
              $removeOrReplaceNodeWithParagraph(editor, cardNode, { focus: 'root-first' })
            } else {
              // Re-create the node selection: focusing places the cursor at the doc start.
              $selectCard(editor, selectedCardKey)
            }

            store.setState({ isEditingCard: false })
          } else {
            store.setState({ isEditingCard: true })
          }

          return true
        }
      }

      if (event && getEventProvenance(event) !== 'nested-editor' && !editorOwnsFocus(editor)) {
        return true
      }

      if (!isNested && selectedCardKey) {
        const cardNode = $getNodeByKey(selectedCardKey)
        if ($isInklingCard(cardNode)) {
          event?.preventDefault()
          const paragraphNode = $createParagraphNode()
          cardNode.insertAfter(paragraphNode)
          paragraphNode.select()
          return true
        }
      }

      if (!isNested && event && $fireFenceKeyboardShortcut(event)) {
        return true
      }

      return false
    },
    COMMAND_PRIORITY_LOW,
  )
}
