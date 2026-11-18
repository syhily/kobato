import { CardPickerStoreContext } from '@kobato/inkling-internal/context/CardPickerStoreContext'
import { createCardPickerStore, type CardPickerStore } from '@kobato/inkling-internal/plugins/behaviour/cardPickerStore'
import React from 'react'

// Test stand-in for the per-composer provider InklingComposer mounts: wraps
// children in a CardPickerStoreContext.Provider backed by a real store.
// Returns the store alongside the wrapper so tests can seed or inspect the
// active pick request — the createCardSelectionStoreWrapper sibling.
export function createCardPickerStoreWrapper({ store = createCardPickerStore() }: { store?: CardPickerStore } = {}) {
  function CardPickerStoreWrapper({ children }: { children: React.ReactNode }) {
    return <CardPickerStoreContext.Provider value={store}>{children}</CardPickerStoreContext.Provider>
  }
  return { store, wrapper: CardPickerStoreWrapper }
}
