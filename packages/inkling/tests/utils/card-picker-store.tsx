import type { ReactNode } from 'react'

import { CardPickerStoreContext } from '@kobato/inkling-internal/context/CardPickerStoreContext'
import {
  createCardPickerStore,
  type CardPickerStore,
} from '@kobato/inkling-internal/plugins/behaviour/card-picker-store'
export function createCardPickerStoreWrapper({ store = createCardPickerStore() }: { store?: CardPickerStore } = {}) {
  function CardPickerStoreWrapper({ children }: { children: ReactNode }) {
    return <CardPickerStoreContext.Provider value={store}>{children}</CardPickerStoreContext.Provider>
  }
  return { store, wrapper: CardPickerStoreWrapper }
}
