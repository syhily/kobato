import type { NodeKey } from 'lexical'

import { createComposerHandle, type ComposerHandle } from '@/inkling/plugins/behaviour/composer-handle'

/**
 * One in-flight card pick request (CONTEXT.md: "pick seam"): the card node a
 * host picker dialog is open for. `nodeType` rides along so the picker host
 * resolves the spec without reading the node — which may be deleted while
 * the dialog is open (the host drops the request on that update).
 */
export interface CardPickRequest {
  nodeKey: NodeKey
  nodeType: string
}

export interface CardPickerState {
  /** The active pick request; null when no picker is open. */
  request: CardPickRequest | null
}

export type CardPickerStore = ComposerHandle<CardPickerState>

// Editor-side handle for the card pick seam, built on the composer handle
// factory — the cardSelectionStore sibling. Writers are the useCardPicker
// hook (placeholder/chrome clicks) and CardInsertPlugin (autoOpenOnInsert);
// the reader is CardPickerHostPlugin, render-only via the context binding.
// One instance per top-level composer (created in ComposerHandlesProvider).
export function createCardPickerStore(): CardPickerStore {
  return createComposerHandle<CardPickerState>({
    request: null,
  })
}
