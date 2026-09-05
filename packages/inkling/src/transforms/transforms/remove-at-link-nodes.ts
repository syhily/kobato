import type { LexicalEditor } from 'lexical'

/* c8 ignore start */
import { $isTextNode } from 'lexical'

import { AtLinkNode } from '@/nodes/base'
import { registerNodeTransformIfPresent } from '@/transforms/register-node-transform'
/* c8 ignore stop */

// used when rendering to make sure we're not rendering the temporary
// nodes used for searching internal links
export function removeAtLinkNodesTransform(node: AtLinkNode) {
  const prevSibling = node.getPreviousSibling()
  const nextSibling = node.getNextSibling()

  // Remove a surrounding space if it exists to avoid double-spacing after removal
  // AtLink nodes should always exist surrounded by spaces unless at beginning or end of text
  if (prevSibling) {
    if ($isTextNode(prevSibling) && prevSibling.getTextContent().endsWith(' ')) {
      prevSibling.setTextContent(prevSibling.getTextContent().slice(0, -1))
    }
  } else if (nextSibling) {
    if ($isTextNode(nextSibling) && nextSibling.getTextContent().startsWith(' ')) {
      nextSibling.setTextContent(nextSibling.getTextContent().slice(1))
    }
  }

  node.remove()
}

// installs only when the editor registers AtLinkNode (the shared gate —
// a ./core-style surface has no at-link nodes to remove)
export function registerRemoveAtLinkNodesTransform(editor: LexicalEditor) {
  return registerNodeTransformIfPresent(editor, AtLinkNode, removeAtLinkNodesTransform)
}
