import React from 'react'

import { CardSelectionStoreContext } from '@/context/CardSelectionStoreContext'
import {
  createCardSelectionStore,
  type CardSelectionState,
  type CardSelectionStore,
} from '@/plugins/behaviour/cardSelectionStore'

// Test stand-in for the per-composer provider InklingComposer mounts: wraps
// children in a CardSelectionStoreContext.Provider backed by a real store.
// Returns the store alongside the wrapper so tests can seed or inspect state;
// pass initialState to seed selection/edit-mode up front (the store equivalent
// of the old per-test CardContext factories).
export function createCardSelectionStoreWrapper({
  store = createCardSelectionStore(),
  initialState = {},
}: {
  store?: CardSelectionStore
  initialState?: Partial<CardSelectionState>
} = {}) {
  store.setState(initialState)
  function CardSelectionStoreWrapper({ children }: { children: React.ReactNode }) {
    return <CardSelectionStoreContext.Provider value={store}>{children}</CardSelectionStoreContext.Provider>
  }
  return { store, wrapper: CardSelectionStoreWrapper }
}
