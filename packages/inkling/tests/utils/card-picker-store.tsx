import { CardPickerStoreContext } from '@kobato/inkling-internal/context/CardPickerStoreContext'
import {
  createCardPickerStore,
  type CardPickerStore,
} from '@kobato/inkling-internal/plugins/behaviour/card-picker-store'
import React from 'react'

export function createCardPickerStoreWrapper({ store = createCardPickerStore() }: { store?: CardPickerStore } = {}) {
  function CardPickerStoreWrapper({ children }: { children: React.ReactNode }) {
    return <CardPickerStoreContext.Provider value={store}>{children}</CardPickerStoreContext.Provider>
  }
  return { store, wrapper: CardPickerStoreWrapper }
}
