import type { LexicalNode } from 'lexical'

/**
 * The INSERT_CARD_COMMAND payload: the constructed node plus the insert-time
 * intent flags the insert choreography (`registerCardCommands`) honors —
 * `openInEditMode` enters edit mode on the fresh card (the five edit-mode
 * declarations), `openPicker` opens the card's registered picker on it
 * (CONTEXT.md: "pick seam" — set by the insert registrar for
 * `picker.autoOpenOnInsert` host cards, or by a host's own intent command,
 * e.g. kobato's image-library entry).
 */
export interface InsertCardPayload {
  cardNode: LexicalNode
  openInEditMode?: boolean
  openPicker?: boolean
}

export interface SelectCardPayload {
  cardKey: string
}

export interface DeleteCardPayload {
  cardKey: string
  direction?: 'forward' | 'backward'
}

export interface LinkMatchPayload {
  // the pasted URL as a [full-match, group] pair (both are the pasted text);
  // registerLinkMatching reads [1]
  linkMatch: readonly [string, string]
}
