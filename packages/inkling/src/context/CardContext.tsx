import type { NodeKey } from 'lexical'

import React from 'react'

export interface CardContextValue {
  captionHasFocus: boolean
  cardType?: string | null | undefined
  nodeKey: NodeKey | undefined
  setCaptionHasFocus: (focused: boolean) => void
}

const CardContext = React.createContext<CardContextValue>({
  captionHasFocus: false,
  cardType: undefined,
  nodeKey: undefined,
  setCaptionHasFocus: () => {
    /* noop */
  },
})

export default CardContext
