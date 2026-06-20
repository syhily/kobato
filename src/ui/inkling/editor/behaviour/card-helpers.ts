import type { LexicalNode } from 'lexical'

import { $createNodeSelection, $setSelection } from 'lexical'

import { SolutionCardNode, TwoColumnCardNode } from '@/ui/inkling/editor/cards/layout-card-nodes'
import {
  CodeCardNode,
  HorizontalRuleCardNode,
  ImageCardNode,
  MathCardNode,
  MusicCardNode,
  TableCardNode,
} from '@/ui/inkling/editor/cards/simple-card-nodes'

/**
 * Enter a `NodeSelection` on the given node. Used by keyboard navigation
 * and click-to-select to focus a block-level card without moving the caret.
 */
export function $selectNode(node: LexicalNode): void {
  const nodeSelection = $createNodeSelection()
  nodeSelection.add(node.getKey())
  $setSelection(nodeSelection)
}

/**
 * Returns true if the node is a block-level card (image, code, math, music,
 * table, horizontal-rule, solution, or two-column). Used by keyboard
 * navigation and click-to-select to identify card boundaries.
 */
export function $isBlockCardNode(node: LexicalNode | null | undefined): boolean {
  return (
    node instanceof ImageCardNode ||
    node instanceof CodeCardNode ||
    node instanceof MathCardNode ||
    node instanceof MusicCardNode ||
    node instanceof TableCardNode ||
    node instanceof HorizontalRuleCardNode ||
    node instanceof SolutionCardNode ||
    node instanceof TwoColumnCardNode
  )
}
