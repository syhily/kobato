import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { COMMAND_PRIORITY_EDITOR } from 'lexical'
import { useEffect } from 'react'

import {
  $insertBlockCard,
  INKLING_CARD_MENU_ITEMS,
  INSERT_INKLING_CARD_COMMAND,
} from '@/ui/inkling/editor/cards/card-registry'

/**
 * Handles {@link INSERT_INKLING_CARD_COMMAND} dispatched by the vendored
 * slash / plus card menus (each card's `kgMenu` entry carries
 * `insertParams: { cardType }`). Command listeners run inside a Lexical
 * update context, so `$insertBlockCard` is called directly.
 */
export function CardInsertPlugin(): null {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    return editor.registerCommand(
      INSERT_INKLING_CARD_COMMAND,
      (payload) => {
        const item = INKLING_CARD_MENU_ITEMS.find((candidate) => candidate.type === payload.cardType)
        if (item === undefined) {
          return false
        }
        $insertBlockCard(item.createNode)
        return true
      },
      COMMAND_PRIORITY_EDITOR,
    )
  }, [editor])

  return null
}
