import type { LexicalEditor } from 'lexical'

import { $createParagraphNode, $getNodeByKey, COMMAND_PRIORITY_LOW, KEY_ENTER_COMMAND } from 'lexical'

import type { KeyboardNavigationDeps } from '@/inkling/plugins/behaviour/keyboard-navigation/types'

import { $fireFenceKeyboardShortcut } from '@/inkling/markdown/card-shortcuts'
import { $isInklingCard } from '@/inkling/nodes/base'
import {
  $removeOrReplaceNodeWithParagraph,
  $selectCard,
  editorOwnsFocus,
} from '@/inkling/plugins/behaviour/card-adjacency'
import { getEventProvenance } from '@/inkling/plugins/behaviour/nested-editor-protocol'

export function registerEnterCommand(editor: LexicalEditor, deps: KeyboardNavigationDeps): () => void {
  const { store, isNested } = deps

  return editor.registerCommand(
    KEY_ENTER_COMMAND,
    (event) => {
      const { selectedCardKey, isEditingCard } = store.getState()

      // Ctrl/Cmd+Enter toggles edit mode regardless of selection.
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

      // Let the browser handle selection inside a card inner element (e.g. nested editor).
      // Must come after ctrl/cmd+enter, which toggles regardless of selection.
      if (event && getEventProvenance(event) !== 'nested-editor' && !editorOwnsFocus(editor)) {
        return true
      }

      // The selected key may point at a card since removed: only intercept then.
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

      // Code card shortcut: trigger only; regex, language extraction and
      // replace-and-select live in @/inkling/markdown/card-shortcuts.
      if (!isNested && event && $fireFenceKeyboardShortcut(event)) {
        return true
      }

      return false
    },
    COMMAND_PRIORITY_LOW,
  )
}
