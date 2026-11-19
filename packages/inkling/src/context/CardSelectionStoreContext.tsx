import type { NodeKey } from 'lexical'

import {
  createCardSelectionStore,
  type CardSelectionState,
} from '@kobato/inkling-internal/plugins/behaviour/card-selection-store'
import { createComposerHandleBinding } from '@kobato/inkling-internal/plugins/behaviour/composer-handle'

export const {
  Context: CardSelectionStoreContext,
  useHandle: useCardSelectionStore,
  useHandleState: useCardSelectionState,
} = createComposerHandleBinding<CardSelectionState>(createCardSelectionStore)

export function useCardIsSelected(nodeKey: NodeKey | undefined): boolean {
  return useCardSelectionState((state) => state.selectedCardKey === nodeKey)
}

export function useCardIsEditing(nodeKey: NodeKey | undefined): boolean {
  return useCardSelectionState((state) => state.selectedCardKey === nodeKey && state.isEditingCard)
}
