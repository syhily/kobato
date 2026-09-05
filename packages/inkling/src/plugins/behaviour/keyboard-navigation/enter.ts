import type { LexicalEditor } from 'lexical'

import { $createParagraphNode, $getNodeByKey, COMMAND_PRIORITY_LOW, KEY_ENTER_COMMAND } from 'lexical'

import { $fireFenceKeyboardShortcut } from '@/markdown/card-shortcuts'
import { $isInklingCard } from '@/nodes/base'

import type { KeyboardNavigationDeps } from './types'

import { $removeOrReplaceNodeWithParagraph, $selectCard, editorOwnsFocus } from '../card-adjacency'
import { getEventProvenance } from '../nested-editor-protocol'

export function registerEnterCommand(editor: LexicalEditor, deps: KeyboardNavigationDeps): () => void {
  const { store, isNested } = deps

  return editor.registerCommand(
    KEY_ENTER_COMMAND,
    (event) => {
      const { selectedCardKey, isEditingCard } = store.getState()

      // toggle edit mode if a card is selected and ctrl/cmd+enter is pressed
      if (selectedCardKey && event && (event.metaKey || event.ctrlKey)) {
        const cardNode = $getNodeByKey(selectedCardKey)

        if ($isInklingCard(cardNode) && cardNode.hasEditMode()) {
          event.preventDefault()

          // when leaving edit mode, ensure focus moves back to the editor
          // otherwise focus can be left on removed elements preventing further key events
          if (isEditingCard) {
            if (cardNode.isEmpty?.()) {
              // the removal surgery (and its root-first focus choreography)
              // lives in the card-adjacency module; selecting the next block
              // directly rather than dispatching KEY_ARROW_DOWN_COMMAND
              // avoids its bail-out when focus is still inside the card's
              // nested editor
              $removeOrReplaceNodeWithParagraph(editor, cardNode, { focus: 'root-first' })
            } else {
              // re-create the node selection because the focus will place the cursor at
              // the beginning of the doc
              $selectCard(editor, selectedCardKey)
            }

            store.setState({ isEditingCard: false })
          } else {
            store.setState({ isEditingCard: true })
          }

          return true
        }
      }

      // let the browser handle selection when in a card inner element (e.g. nested editor)
      // NOTE: must come after ctrl/cmd+enter because that always toggles no matter the selection
      if (event && getEventProvenance(event) !== 'nested-editor' && !editorOwnsFocus(editor)) {
        return true
      }

      // if a card is selected, insert a new paragraph after it
      // the selected key may point at a card that has since been removed —
      // only intercept enter when the card actually still exists
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

      // code card shortcut — trigger only; the regex, language extraction, and
      // replace-and-select live in the card-shortcut seam (@/markdown/card-shortcuts)
      if (!isNested && event && $fireFenceKeyboardShortcut(event)) {
        return true
      }

      return false
    },
    COMMAND_PRIORITY_LOW,
  )
}
