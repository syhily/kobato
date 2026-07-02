import { $createNodeSelection, $setSelection, type LexicalNode } from 'lexical'

export function $selectDecoratorNode(node: LexicalNode): void {
  const nodeSelection = $createNodeSelection()
  nodeSelection.add(node.getKey())
  $setSelection(nodeSelection)
}
