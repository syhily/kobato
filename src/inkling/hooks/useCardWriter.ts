import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { HISTORY_MERGE_TAG, type LexicalNode, type NodeKey } from 'lexical'
import React from 'react'

import { $updateCardNode } from '@/inkling/nodes/base'

export interface CardWriteOptions {
  /**
   * Merge this write into the previous history entry instead of pushing a
   * new undo step — applied inkling-side as Lexical's `HISTORY_MERGE_TAG`
   * update tag (hosts name the option, never the tag). The pick seam's
   * insert-then-pick flow uses it (the request's `fromInsert` marker) so
   * one undo retracts insert and pick together; a write on an already
   * resolved card (replace) leaves it unset and stays a discrete entry.
   */
  mergeHistory?: boolean
}

/**
 * The React binding of the card write seam (CONTEXT.md: "card write seam"):
 * one `write(node => { ... })` per card component replaces the hand-copied
 * `editor.update(() => $updateCardNode(nodeKey, guard, ...))` ceremony. The
 * guard still does the narrowing, so every field the mutator writes is checked
 * against the card's own node type.
 */
export function useCardWriter<T extends LexicalNode>(
  nodeKey: NodeKey,
  guard: (node: unknown) => node is T,
): (update: (node: T) => void, options?: CardWriteOptions) => void {
  const [editor] = useLexicalComposerContext()
  return React.useCallback(
    (update: (node: T) => void, options?: CardWriteOptions) => {
      editor.update(
        () => {
          $updateCardNode(nodeKey, guard, update)
        },
        options?.mergeHistory === true ? { tag: HISTORY_MERGE_TAG } : undefined,
      )
    },
    [editor, nodeKey, guard],
  )
}
