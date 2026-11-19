import type { LexicalNode } from 'lexical'

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
  linkMatch: readonly [string, string]
}
