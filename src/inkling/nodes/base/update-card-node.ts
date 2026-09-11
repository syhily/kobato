import { $getNodeByKey, type LexicalNode, type NodeKey } from 'lexical'

/**
 * The one write seam for card-node fields (CONTEXT.md: "card"). Replaces
 * the `$getNodeByKey` + `GeneratedDecoratorNodeBase`-cast idiom, which
 * erased the typed datasets: the guard does the narrowing, so every field
 * the mutator writes is checked against the card's own node type. Call
 * inside `editor.update()`. Generated node types carry no index signature,
 * so unknown field names fail typecheck; the dataset properties are writable
 * through their plain-name accessors, and transient/nested-editor fields are
 * declared on each card's node type.
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
