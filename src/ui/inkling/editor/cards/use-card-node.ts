import type { LexicalEditor, LexicalNode } from 'lexical'

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { useLexicalNodeSelection } from '@lexical/react/useLexicalNodeSelection'

/**
 * Shared hook for every card React component. Collapses the two-line boilerplate
 * that appeared identically in all six card components:
 *
 *   const [editor] = useLexicalComposerContext()
 *   const [isSelected] = useLexicalNodeSelection(node.getKey())
 *
 * into a single call. The `update(patch)` callback is NOT included here because
 * each card maps patch fields to different node setters — that mapping is
 * card-specific and belongs in the component.
 *
 * @returns `{ editor, isSelected }` — the editor instance (for dispatching
 * updates) and the current NodeSelection state of this card.
 */
export function useCardNode(node: { getKey: () => string } & LexicalNode): {
  editor: LexicalEditor
  isSelected: boolean
} {
  const [editor] = useLexicalComposerContext()
  const [isSelected] = useLexicalNodeSelection(node.getKey())
  return { editor, isSelected }
}
