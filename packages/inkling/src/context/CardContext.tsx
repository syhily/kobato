import type { NodeKey } from 'lexical'

import React from 'react'

// Card-local state only: selection/edit mode lives in the per-composer card
// selection store (useCardIsSelected / useCardIsEditing), and edit mode is an
// EDIT_CARD_COMMAND dispatch. Card width arrives as a prop, never as context.
// `cardType` comes from the wrapper's init read so the toolbar label resolves
// without a second, un-subscribed editor read.
export interface CardContextValue {
  captionHasFocus: boolean
  /** The card's node type; absent outside a card wrapper. */
  cardType?: string | null | undefined
  nodeKey: NodeKey | undefined
  setCaptionHasFocus: (focused: boolean) => void
}

const CardContext = React.createContext<CardContextValue>({
  captionHasFocus: false,
  cardType: undefined,
  nodeKey: undefined,
  setCaptionHasFocus: () => {
    /* noop default outside a card wrapper */
  },
})

export default CardContext
