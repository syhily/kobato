import { $getNodeByKey, type LexicalNode, type NodeKey } from 'lexical'

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
