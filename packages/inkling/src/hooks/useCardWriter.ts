import { $updateCardNode } from '@kobato/inkling-internal/nodes/base'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { HISTORY_MERGE_TAG, type LexicalNode, type NodeKey } from 'lexical'
import React from 'react'

export interface CardWriteOptions {
  mergeHistory?: boolean
}

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
