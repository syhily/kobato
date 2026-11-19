import type { LexicalEditor, NodeKey } from 'lexical'

import { $isMathInlineNode } from '@kobato/inkling-internal/nodes/math/MathInlineNode'
import {
  $getNearestNodeFromDOMNode,
  $getSelection,
  $isNodeSelection,
  COMMAND_PRIORITY_LOW,
  createCommand,
  KEY_ENTER_COMMAND,
} from 'lexical'

export const EDIT_MATH_INLINE_COMMAND = createCommand<{ nodeKey: NodeKey }>('EDIT_MATH_INLINE_COMMAND')
/**
 * Double-click half of the edit gesture: resolves the math inline node under
 * the event target (the preview is a plain DOM subtree — createDOM renders
 * the stored artifacts without React) and dispatches
 * `EDIT_MATH_INLINE_COMMAND` with its key. Returns whether a node was hit.
 * The dispatch happens outside the read — dispatchCommand runs its own update.
 */
export function dispatchEditMathInlineAtTarget(editor: LexicalEditor, target: EventTarget | null): boolean {
  // The target can be any descendant of the preview — including SVG or MathML
  // elements, which are not HTMLElements — so narrow to Element only.
  if (!(target instanceof Element)) {
    return false
  }
  const preview = target.closest('[data-inkling-math-inline]')
  if (!preview) {
    return false
  }

  let nodeKey: NodeKey | null = null
  editor.read(() => {
    const node = $getNearestNodeFromDOMNode(preview)
    if ($isMathInlineNode(node)) {
      nodeKey = node.getKey()
    }
  })
  if (nodeKey === null) {
    return false
  }

  editor.dispatchCommand(EDIT_MATH_INLINE_COMMAND, { nodeKey })
  return true
}

export function registerMathInlineEnter(editor: LexicalEditor): () => void {
  return editor.registerCommand(
    KEY_ENTER_COMMAND,
    () => {
      const selection = $getSelection()
      if (!$isNodeSelection(selection)) {
        return false
      }
      const nodes = selection.getNodes()
      if (nodes.length !== 1 || !$isMathInlineNode(nodes[0])) {
        return false
      }
      editor.dispatchCommand(EDIT_MATH_INLINE_COMMAND, { nodeKey: nodes[0].getKey() })
      return true
    },
    COMMAND_PRIORITY_LOW,
  )
}
