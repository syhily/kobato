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
export function dispatchEditMathInlineAtTarget(editor: LexicalEditor, target: EventTarget | null): boolean {
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
