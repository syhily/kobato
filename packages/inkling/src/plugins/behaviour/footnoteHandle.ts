import type { NodeKey } from 'lexical'

import { createComposerHandle, type ComposerHandle } from './composer-handle'

// Editor-side handle for the per-top-level-composer footnote channel, built
// on the composer handle factory (same shape as tkHandle/wordCountHandle).
// Holds the render-time maps the definition rows subscribe to — the rows are
// chrome and must not walk the tree themselves — plus the focus-handoff
// request the caret trigger files for the freshly created definition (the
// row's nested editor does not exist at insert time, so the request waits
// for the row to mount and claim it). Fed by FootnotePlugin; React
// subscribes render-only via useFootnoteHandleState. One instance per
// top-level composer (created in InklingComposer).

export interface FootnoteHandleState {
  /** targetKey → 1-based visible index — the definition's rank in the doc-end run, matching the exported `<li>` anchor. */
  indices: Record<string, number>
  /** targetKey → the definition card's node key. */
  definitionNodeKeys: Record<string, NodeKey>
  /** targetKey of the definition whose nested editor takes focus next (consumed and cleared by its row). */
  focusRequest: { targetKey: string; nonce: number } | null
}

export interface FootnoteHandle extends ComposerHandle<FootnoteHandleState> {
  /** Publish fresh render-time maps; the factory's record-aware change guard swallows a content-equal publish. */
  publishMaps: (indices: Record<string, number>, definitionNodeKeys: Record<string, NodeKey>) => void
  /** File a focus handoff for a freshly inserted definition. */
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
