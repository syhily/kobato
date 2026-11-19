import { createComposerHandle, type ComposerHandle } from '@kobato/inkling-internal/plugins/behaviour/composer-handle'

export interface CardSelectionState {
  selectedCardKey: string | null
  isEditingCard: boolean
}

export type CardSelectionStore = ComposerHandle<CardSelectionState>

export function createCardSelectionStore(): CardSelectionStore {
  return createComposerHandle<CardSelectionState>({
    selectedCardKey: null,
    isEditingCard: false,
  })
}
