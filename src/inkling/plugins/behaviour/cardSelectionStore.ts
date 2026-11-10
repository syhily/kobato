import { createComposerHandle, type ComposerHandle } from '@/inkling/plugins/behaviour/composer-handle'

// Editor-side handle for card selection state, built on the composer handle
// factory. Owns selectedCardKey and isEditingCard so Lexical handlers can read
// them synchronously instead of closing over a stale React mirror. Fed by
// registerCardSelection and the card command handlers; React subscribes
// render-only via useCardSelectionState. One instance per top-level composer
// (created in InklingComposer).

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
