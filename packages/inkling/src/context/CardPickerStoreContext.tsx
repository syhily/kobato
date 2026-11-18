import {
  createCardPickerStore,
  type CardPickerState,
} from '@kobato/inkling-internal/plugins/behaviour/card-picker-store'
import { createComposerHandleBinding } from '@kobato/inkling-internal/plugins/behaviour/composer-handle'

// Per-composer card pick request store. Nested composers share the top-level
// store, so the picker host plugin mounts only on non-nested surfaces — a
// nested mount would render the active picker a second time.
export const {
  Context: CardPickerStoreContext,
  useHandle: useCardPickerStore,
  useHandleState: useCardPickerState,
} = createComposerHandleBinding<CardPickerState>(createCardPickerStore)
