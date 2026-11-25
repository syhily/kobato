import type { ReactNode } from 'react'

import { CardSelectionStoreContext } from '@kobato/inkling-internal/context/CardSelectionStoreContext'
import {
  createCardSelectionStore,
  type CardSelectionState,
  type CardSelectionStore,
} from '@kobato/inkling-internal/plugins/behaviour/card-selection-store'
export function createCardSelectionStoreWrapper({
  store = createCardSelectionStore(),
  initialState = {},
}: {
  store?: CardSelectionStore
  initialState?: Partial<CardSelectionState>
} = {}) {
  store.setState(initialState)
  function CardSelectionStoreWrapper({ children }: { children: ReactNode }) {
    return <CardSelectionStoreContext.Provider value={store}>{children}</CardSelectionStoreContext.Provider>
  }
  return { store, wrapper: CardSelectionStoreWrapper }
}
