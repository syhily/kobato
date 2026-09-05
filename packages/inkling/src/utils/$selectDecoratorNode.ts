import { $createNodeSelection, $setSelection, type LexicalNode } from 'lexical'

/**
 * The bare decorator-selection primitive — the 'never' leg of the card
 * selection focus policy (see $selectCard in
 * src/plugins/behaviour/card-adjacency.ts): no focus repair, for callers
 * that already own focus (keyboard navigation). Anything that needs the
 * editor element focused after the selection goes through $selectCard.
 */
export function $selectDecoratorNode(node: LexicalNode): void {
  const nodeSelection = $createNodeSelection()
  nodeSelection.add(node.getKey())
  $setSelection(nodeSelection)
}
