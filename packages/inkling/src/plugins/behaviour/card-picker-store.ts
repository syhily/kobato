import type { NodeKey } from 'lexical'

import { createComposerHandle, type ComposerHandle } from '@kobato/inkling-internal/plugins/behaviour/composer-handle'

export interface CardPickRequest {
  nodeKey: NodeKey
  nodeType: string
  fromInsert?: boolean
}

export interface CardPickerState {
  request: CardPickRequest | null
}

export type CardPickerStore = ComposerHandle<CardPickerState>

export function createCardPickerStore(): CardPickerStore {
  return createComposerHandle<CardPickerState>({
    request: null,
  })
}
