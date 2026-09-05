import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { type LexicalNode, type NodeKey } from 'lexical'
import React from 'react'

import { $updateCardNode } from '@/nodes/base'

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
): (update: (node: T) => void) => void {
  const [editor] = useLexicalComposerContext()
  return React.useCallback(
    (update: (node: T) => void) => {
      editor.update(() => {
        $updateCardNode(nodeKey, guard, update)
      })
    },
    [editor, nodeKey, guard],
  )
}
