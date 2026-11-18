import type { LexicalEditor } from 'lexical'

import { registerNodeTransformIfPresent } from '@kobato/inkling-internal/transforms/register-node-transform'
/* c8 ignore start */
import { $isListNode, ListNode } from '@lexical/list'
/* c8 ignore stop */

export function mergeListNodesTransform(node: ListNode) {
  const nextSibling = node.getNextSibling()

  if ($isListNode(nextSibling) && nextSibling.getListType() === node.getListType()) {
    node.append(...nextSibling.getChildren())
    nextSibling.remove()
  }
}

export function registerMergeListNodesTransform(editor: LexicalEditor) {
  return registerNodeTransformIfPresent(editor, ListNode, mergeListNodesTransform)
}
