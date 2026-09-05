import type { NodeKey } from 'lexical'

import { createCardSelectionStore, type CardSelectionState } from '@/plugins/behaviour/cardSelectionStore'
import { createComposerHandleBinding } from '@/plugins/behaviour/composer-handle'

// Internal context carrying the per-composer card selection store (plan 038).
// InklingComposer creates one instance per top-level composer and exposes it
// here. The default is a fallback for consumers rendered outside any provider
// (e.g. isolated plugin tests); real editors always get the provider's
// instance, so composers never share selection state through this default.
export const {
  Context: CardSelectionStoreContext,
  useHandle: useCardSelectionStore,
  useHandleState: useCardSelectionState,
} = createComposerHandleBinding<CardSelectionState>(createCardSelectionStore)

/**
 * The named per-card bindings over the store — the one home of the
 * `selectedCardKey === nodeKey` selector shape, so the reference-equality
 * change guard's re-render granularity is decided here, never per call site.
 * Cards subscribe through these; raw `useCardSelectionState` is for
 * cross-card reads (the wrapper's selectedCardKey, the plugin-wide
 * isEditingCard).
 */

/** True while this card is the selected card (edit mode or not). */
export function useCardIsSelected(nodeKey: NodeKey | undefined): boolean {
  return useCardSelectionState((state) => state.selectedCardKey === nodeKey)
}

/** True while this card is the selected card AND in edit mode. */
export function useCardIsEditing(nodeKey: NodeKey | undefined): boolean {
  return useCardSelectionState((state) => state.selectedCardKey === nodeKey && state.isEditingCard)
}
