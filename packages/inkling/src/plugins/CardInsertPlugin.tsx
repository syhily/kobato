import type { LexicalEditor } from 'lexical'

import {
  getCardInsertRegistrations,
  type CardInsertRegistration,
} from '@kobato/inkling-internal/nodes/cards/card-insert-commands'
import { INSERT_MEDIA_COMMAND } from '@kobato/inkling-internal/plugins/behaviour/clipboard-protocol'
import { INSERT_CARD_COMMAND } from '@kobato/inkling-internal/plugins/behaviour/commands'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getSelection, $isRangeSelection, COMMAND_PRIORITY_HIGH, COMMAND_PRIORITY_LOW, mergeRegister } from 'lexical'
import React from 'react'

// command payloads cross an untyped runtime boundary (menu dispatch, external
// consumers), so narrow before constructing the node
function isCardDataset(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function registerCardInsert(
  editor: LexicalEditor,
  { nodeType, node, command, insert, pickerAutoOpen }: CardInsertRegistration,
) {
  const insertCard = (dataset: Record<string, unknown>) => {
    // key presence is observable in INSERT_CARD_COMMAND listeners: the
    // openInEditMode key exists only for the five edit-mode cards, openPicker
    // only for picker-carrying cards (CONTEXT.md: "pick seam"). Both ride the
    // insert-COMMAND channel, so editor-state loads never trigger either.
    editor.dispatchCommand(INSERT_CARD_COMMAND, {
      cardNode: new node(dataset),
      ...(insert.openInEditMode ? { openInEditMode: true } : {}),
      ...(pickerAutoOpen === true ? { openPicker: true } : {}),
    })
  }

  return mergeRegister(
    editor.registerCommand(
      command,
      (dataset) => {
        if (insert.requiresRangeSelection) {
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
