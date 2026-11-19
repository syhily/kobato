import type { NodeKey } from 'lexical'

import { createComposerHandle, type ComposerHandle } from '@kobato/inkling-internal/plugins/behaviour/composer-handle'

export interface FootnoteHandleState {
  indices: Record<string, number>
  definitionNodeKeys: Record<string, NodeKey>
  focusRequest: { targetKey: string; nonce: number } | null
}

export interface FootnoteHandle extends ComposerHandle<FootnoteHandleState> {
  publishMaps: (indices: Record<string, number>, definitionNodeKeys: Record<string, NodeKey>) => void

  requestFocus: (targetKey: string) => void
}

export function createFootnoteHandle(): FootnoteHandle {
  const handle = createComposerHandle<FootnoteHandleState>(
    {
      indices: {},
      definitionNodeKeys: {},
      focusRequest: null,
    },
    { recordKeys: ['indices', 'definitionNodeKeys'] },
  )

  return {
    ...handle,

    publishMaps(indices, definitionNodeKeys) {
      handle.setState({ indices, definitionNodeKeys })
    },

    requestFocus(targetKey) {
      handle.setState({ focusRequest: { targetKey, nonce: Date.now() } })
    },
  }
}
