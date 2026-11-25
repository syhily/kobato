import type { NodeKey } from 'lexical'

import { createContext } from 'react'
export interface CardContextValue {
  captionHasFocus: boolean
  cardType?: string | null | undefined
  nodeKey: NodeKey | undefined
  setCaptionHasFocus: (focused: boolean) => void
}

const CardContext = createContext<CardContextValue>({
  captionHasFocus: false,
  cardType: undefined,
  nodeKey: undefined,
  setCaptionHasFocus: () => undefined,
})

export default CardContext
