/* c8 ignore next */
import type { ElementNode, Klass, LexicalEditor } from 'lexical'

import { registerNodeTransformIfPresent } from '@/transforms/register-node-transform'

export function removeAlignmentTransform(node: ElementNode) {
  // on element nodes format===text-align in Lexical
  if (node.getFormatType() !== '') {
    node.setFormat('')
  }
}

export function registerRemoveAlignmentTransform<T extends ElementNode>(editor: LexicalEditor, klass: Klass<T>) {
  return registerNodeTransformIfPresent(editor, klass, removeAlignmentTransform)
}
