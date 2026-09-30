import type { LexicalEditor } from 'lexical'

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getSelection, $isRangeSelection, COMMAND_PRIORITY_HIGH, COMMAND_PRIORITY_LOW, mergeRegister } from 'lexical'
import React from 'react'

import type { CardPickerStore } from '@/inkling/plugins/behaviour/cardPickerStore'

import { useCardPickerStore } from '@/inkling/context/CardPickerStoreContext'
import { getCardInsertRegistrations, type CardInsertRegistration } from '@/inkling/nodes/cards/card-insert-commands'
import { INSERT_MEDIA_COMMAND } from '@/inkling/plugins/behaviour/clipboard-protocol'
import { INSERT_CARD_COMMAND } from '@/inkling/plugins/behaviour/commands'

// command payloads cross an untyped runtime boundary (menu dispatch, external
// consumers), so narrow before constructing the node
function isCardDataset(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function registerCardInsert(
  editor: LexicalEditor,
  { nodeType, node, command, insert, pickerAutoOpen }: CardInsertRegistration,
  cardPickerStore: CardPickerStore,
) {
  const insertCard = (dataset: Record<string, unknown>) => {
    // key presence is observable in INSERT_CARD_COMMAND listeners: the
    // openInEditMode key exists only for the five edit-mode cards
    const cardNode = new node(dataset)
    const inserted = editor.dispatchCommand(INSERT_CARD_COMMAND, {
      cardNode,
      ...(insert.openInEditMode ? { openInEditMode: true } : {}),
    })
    // picker.autoOpenOnInsert host cards open their picker on the fresh node
    // (CONTEXT.md: "pick seam"). This rides the insert-COMMAND channel, so
    // editor-state loads (which never dispatch it) cannot trigger the picker.
    // The dispatch is synchronous — the node has landed when it returns true.
    if (inserted && pickerAutoOpen === true) {
      cardPickerStore.setState({ request: { nodeKey: cardNode.getKey(), nodeType } })
    }
  }

  return mergeRegister(
    editor.registerCommand(
      command,
      (dataset) => {
        if (insert.requiresRangeSelection) {
          // bookmark parity: the selection check precedes the dataset guard
          const selection = $getSelection()
          if (!$isRangeSelection(selection)) {
            return false
          }
          if (!isCardDataset(dataset)) {
            return false
          }
          insertCard(dataset)
          return true
        }
        if (!isCardDataset(dataset)) {
          return false
        }
        insertCard(dataset)
        return true
      },
      insert.insertCommandPriority === 'high' ? COMMAND_PRIORITY_HIGH : COMMAND_PRIORITY_LOW,
    ),
    ...(insert.claimsMediaInsert
      ? [
          editor.registerCommand(
            INSERT_MEDIA_COMMAND,
            (media) => {
              if (media.type === nodeType) {
                editor.dispatchCommand(command, { initialFile: media.file })
                return true
              }
              return false
            },
            COMMAND_PRIORITY_HIGH,
          ),
        ]
      : []),
  )
}

/**
 * The derived view of the card declarations' insert specs (plan 043) — one
 * registrar replacing the eleven hand-written card insert plugins. Every
 * registration fact (command, payload guard, `openInEditMode`, media
 * claiming, priority, bookmark's selection quirk, the picker auto-open) comes
 * from the card declarations via the `@/inkling/nodes/cards/card-insert-commands`
 * projection, which also carries the host cards' insert registrations
 * (CONTEXT.md: "host card"). The per-card `hasNodes` guard against the
 * wrapper class reproduces the mounting matrix: the web editor registers all
 * eleven cards, nested composers none.
 */
export const CardInsertPlugin = () => {
  const [editor] = useLexicalComposerContext()
  const cardPickerStore = useCardPickerStore()

  React.useEffect(() => {
    return mergeRegister(
      ...getCardInsertRegistrations()
        .filter(({ node }) => editor.hasNodes([node]))
        .map((registration) => registerCardInsert(editor, registration, cardPickerStore)),
    )
  }, [editor, cardPickerStore])

  return null
}

export default CardInsertPlugin
