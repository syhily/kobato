import type { LexicalEditor, LexicalNode, NodeKey } from 'lexical'

import { useCardWriter, type CardWriteOptions } from '@kobato/inkling-internal/hooks/useCardWriter'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'

export interface CardChrome<T extends LexicalNode> {
  editor: LexicalEditor
  write: (update: (node: T) => void, options?: CardWriteOptions) => void
  setField: <K extends keyof T>(field: K) => (value: T[K]) => void
}
export function useCardChrome<T extends LexicalNode>(
  nodeKey: NodeKey,
  guard: (node: unknown) => node is T,
): CardChrome<T> {
  const [editor] = useLexicalComposerContext()
  const write = useCardWriter(nodeKey, guard)
  const setField = <K extends keyof T>(field: K) => {
    return (value: T[K]) => {
      write((node) => {
        node[field] = value
      })
    }
  }
  return { editor, write, setField }
}
