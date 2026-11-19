import type { Klass, LexicalEditor, LexicalNode } from 'lexical'

export function registerNodeTransformIfPresent<T extends LexicalNode>(
  editor: LexicalEditor,
  klass: Klass<T>,
  transform: (node: T) => void,
): () => void {
  if (editor.hasNode(klass)) {
    return editor.registerNodeTransform(klass, transform)
  }

  return () => undefined
}
