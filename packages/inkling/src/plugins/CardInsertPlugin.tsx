import type { LexicalEditor } from 'lexical'

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getSelection, $isRangeSelection, COMMAND_PRIORITY_HIGH, COMMAND_PRIORITY_LOW, mergeRegister } from 'lexical'
import React from 'react'

import { getCardInsertRegistrations, type CardInsertRegistration } from '@/nodes/cards/card-insert-commands'
import { INSERT_MEDIA_COMMAND } from '@/plugins/behaviour/clipboard-protocol'
import { INSERT_CARD_COMMAND } from '@/plugins/behaviour/commands'

// command payloads cross an untyped runtime boundary (menu dispatch, external
// consumers), so narrow before constructing the node
function isCardDataset(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function registerCardInsert(editor: LexicalEditor, { nodeType, node, command, insert }: CardInsertRegistration) {
  // key presence is observable in INSERT_CARD_COMMAND listeners: the
  // openInEditMode key exists only for the five edit-mode cards
  const cardPayload = (dataset: Record<string, unknown>) => ({
    cardNode: new node(dataset),
    ...(insert.openInEditMode ? { openInEditMode: true } : {}),
  })

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
          editor.dispatchCommand(INSERT_CARD_COMMAND, cardPayload(dataset))
          return true
        }
        if (!isCardDataset(dataset)) {
          return false
        }
        editor.dispatchCommand(INSERT_CARD_COMMAND, cardPayload(dataset))
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
 * claiming, priority, bookmark's selection quirk) comes from the card
 * declarations via the `@/nodes/cards/card-insert-commands` projection, which
 * also carries the host cards' insert registrations (CONTEXT.md: "host
 * card"). The per-card `hasNodes` guard against the wrapper class reproduces
 * the mounting matrix: the web editor registers all eleven cards, nested
 * composers none.
 */
export const CardInsertPlugin = () => {
  const [editor] = useLexicalComposerContext()

  React.useEffect(() => {
    return mergeRegister(
      ...getCardInsertRegistrations()
        .filter(({ node }) => editor.hasNodes([node]))
        .map((registration) => registerCardInsert(editor, registration)),
    )
  }, [editor])

  return null
}

export default CardInsertPlugin
