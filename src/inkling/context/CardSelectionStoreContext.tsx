import type { NodeKey } from 'lexical'

import { createCardSelectionStore, type CardSelectionState } from '@/inkling/plugins/behaviour/cardSelectionStore'
import { createComposerHandleBinding } from '@/inkling/plugins/behaviour/composer-handle'

// Per-composer card selection store; nested composers share the top-level one.
export const {
  Context: CardSelectionStoreContext,
  useHandle: useCardSelectionStore,
  useHandleState: useCardSelectionState,
} = createComposerHandleBinding<CardSelectionState>(createCardSelectionStore)

// The named per-card bindings are the one home of the
// `selectedCardKey === nodeKey` selector shape, so re-render granularity is
// decided here, never per call site. Raw `useCardSelectionState` is for
// cross-card reads (the wrapper's selectedCardKey, the plugin-wide
// isEditingCard).

/** True while this card is the selected card (edit mode or not). */
export function useCardIsSelected(nodeKey: NodeKey | undefined): boolean {
  return useCardSelectionState((state) => state.selectedCardKey === nodeKey)
}

/** True while this card is the selected card AND in edit mode. */
export function useCardIsEditing(nodeKey: NodeKey | undefined): boolean {
  return useCardSelectionState((state) => state.selectedCardKey === nodeKey && state.isEditingCard)
}
