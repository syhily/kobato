import { $getNodeByKey, type LexicalNode, type NodeKey } from 'lexical'

/**
 * The one write seam for card-node fields: the guard narrows, so unknown
 * field names fail typecheck instead of being erased by a cast. Call inside
 * `editor.update()`.
 */
export function $updateCardNode<T extends LexicalNode>(
  nodeKey: NodeKey,
  guard: (node: unknown) => node is T,
  update: (node: T) => void,
): void {
  const node = $getNodeByKey(nodeKey)
  if (guard(node)) {
    update(node)
  }
}
