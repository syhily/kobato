import { $createNodeSelection, $setSelection, type LexicalNode } from 'lexical'

/**
 * Bare decorator selection with no focus repair, for callers that already own focus
 * (keyboard navigation). Use `$selectCard` when the editor element must end up focused.
 */
export function $selectDecoratorNode(node: LexicalNode): void {
  const nodeSelection = $createNodeSelection()
  nodeSelection.add(node.getKey())
  $setSelection(nodeSelection)
}
