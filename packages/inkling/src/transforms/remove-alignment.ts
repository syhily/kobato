/* c8 ignore next */
import type { ElementNode, Klass, LexicalEditor } from 'lexical'

import { registerNodeTransformIfPresent } from '@kobato/inkling-internal/transforms/register-node-transform'

export function removeAlignmentTransform(node: ElementNode) {
  if (node.getFormatType() !== '') {
    node.setFormat('')
  }
}

export function registerRemoveAlignmentTransform<T extends ElementNode>(editor: LexicalEditor, klass: Klass<T>) {
  return registerNodeTransformIfPresent(editor, klass, removeAlignmentTransform)
}
