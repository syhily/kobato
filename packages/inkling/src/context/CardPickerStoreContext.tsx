import {
  createCardPickerStore,
  type CardPickerState,
} from '@kobato/inkling-internal/plugins/behaviour/card-picker-store'
import { createComposerHandleBinding } from '@kobato/inkling-internal/plugins/behaviour/composer-handle'

export const {
  Context: CardPickerStoreContext,
  useHandle: useCardPickerStore,
  useHandleState: useCardPickerState,
} = createComposerHandleBinding<CardPickerState>(createCardPickerStore)
