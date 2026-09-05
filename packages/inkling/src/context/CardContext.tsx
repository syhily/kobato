import type { NodeKey } from 'lexical'

import React from 'react'

// Genuinely card-local state, provided by InklingCardWrapper to the card
// subtree. Selection/edit-mode state is NOT here — readers subscribe to the
// per-composer card selection store via the named bindings
// (useCardIsSelected / useCardIsEditing), and entering
// edit mode is a direct EDIT_CARD_COMMAND dispatch. Card width flows from the
// node through the declaration's decorateTarget width mapper to the wrapper's
// width prop (and to the card component as a prop for Image/Video) — there is
// no context mirror. The card's node type arrives from the wrapper's init
// read so the toolbar label resolves without a second, un-subscribed editor
// read (useCardToolbarLabel).
export interface CardContextValue {
  captionHasFocus: boolean
  /** The card's node type (the wrapper's init read); absent outside a wrapper. */
  cardType?: string | null | undefined
  nodeKey: NodeKey | undefined
  setCaptionHasFocus: (focused: boolean) => void
}

const CardContext = React.createContext<CardContextValue>({
  captionHasFocus: false,
  cardType: undefined,
  nodeKey: undefined,
  setCaptionHasFocus: () => {},
})

export default CardContext
