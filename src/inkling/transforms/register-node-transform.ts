import type { Klass, LexicalEditor, LexicalNode } from 'lexical'

/**
 * The registration gate for the invariant-transform family (denest,
 * merge-list-nodes, remove-alignment, the table cell guard, the footnote
 * doc-end run, the paragraph restriction). Default transforms run against
 * varying node sets — a core-only surface may not compose the node — so each
 * family member installs only when its node class is present, and a member
 * that forgets the gate crashes such surfaces. One home for the gate: the
 * presence check and the no-op teardown.
 */
export function registerNodeTransformIfPresent<T extends LexicalNode>(
  editor: LexicalEditor,
  klass: Klass<T>,
  transform: (node: T) => void,
): () => void {
  if (editor.hasNode(klass)) {
    return editor.registerNodeTransform(klass, transform)
  }

  return () => {
    // node class absent — nothing was registered, so nothing to teardown
  }
}
