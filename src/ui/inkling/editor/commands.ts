import { createCommand } from 'lexical'

/**
 * Card interaction commands — ported from Koenig's KoenigBehaviourPlugin.
 *
 * These are dispatched by KoenigCardWrapper (on click/mousedown) and handled
 * by CardCommandsPlugin (which updates both Lexical's NodeSelection and the
 * KoenigSelectedCardContext React state).
 *
 * Extracted into a standalone module so KoenigCardWrapper can import the
 * command constants without pulling in the entire behaviour plugin (which
 * in Koenig is 1500+ lines with dozens of node imports).
 */

export interface SelectCardPayload {
  cardKey: string
  focusEditor?: boolean
}

export interface EditCardPayload {
  cardKey: string
  focusEditor?: boolean
}

/** Select a card (NodeSelection + update selectedCardKey). */
export const SELECT_CARD_COMMAND = createCommand<SelectCardPayload>('SELECT_CARD_COMMAND')

/** Enter edit mode on an already-selected card. */
export const EDIT_CARD_COMMAND = createCommand<EditCardPayload>('EDIT_CARD_COMMAND')

/** Delete the currently selected card node. */
export const DELETE_CARD_COMMAND = createCommand<void>('DELETE_CARD_COMMAND')
