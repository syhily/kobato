import type { LexicalNode } from 'lexical'

export interface OpenCardInEditModePayload {
  cardNode: LexicalNode
  openInEditMode?: boolean
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
