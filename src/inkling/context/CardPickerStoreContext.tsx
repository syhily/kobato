import { createCardPickerStore, type CardPickerState } from '@/inkling/plugins/behaviour/cardPickerStore'
import { createComposerHandleBinding } from '@/inkling/plugins/behaviour/composer-handle'

// Internal context carrying the per-composer card pick request store
// (CONTEXT.md: "pick seam") — the CardSelectionStoreContext sibling.
// InklingComposer creates one instance per top-level composer and exposes it
// here; nested composers share the top-level store, so the picker host plugin
// mounts only on non-nested surfaces (a nested mount would render the active
// picker a second time). The default is a fallback for consumers rendered
// outside any provider (e.g. isolated tests).
export const {
  Context: CardPickerStoreContext,
  useHandle: useCardPickerStore,
  useHandleState: useCardPickerState,
} = createComposerHandleBinding<CardPickerState>(createCardPickerStore)
