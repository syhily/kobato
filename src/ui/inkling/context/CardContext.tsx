import { createContext, useContext } from 'react'

/**
 * Per-card context — ported from Koenig's CardContext.
 *
 * Provided by KoenigCardWrapper for each card instance. Card components
 * consume this to read `isSelected` / `isEditing` and to call `setEditing`
 * to transition between selected and editing states.
 *
 * `cardWidth` / `setCardWidth` / `captionHasFocus` / `cardContainerRef`
 * from Koenig are omitted (we don't have wide/full card widths or caption
 * nested editors yet).
 */
export interface CardContextValue {
  isSelected: boolean
  isEditing: boolean
  setEditing: (shouldEdit: boolean) => void
  nodeKey: string
}

const CardContext = createContext<CardContextValue>({
  isSelected: false,
  isEditing: false,
  setEditing: () => undefined,
  nodeKey: '',
})

export function useCardContext(): CardContextValue {
  return useContext(CardContext)
}

export default CardContext
