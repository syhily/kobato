import { assembleCardNodeOnce } from '@/nodes/assemble-card-node'
import { horizontalRuleDeclaration } from '@/nodes/cards/horizontalrule.declaration'

export { $isHorizontalRuleNode } from '@/nodes/base/nodes/horizontalrule/HorizontalRuleNode'
export { INSERT_HORIZONTAL_RULE_COMMAND } from '@/nodes/cards/card-commands'

/**
 * Transition shim (plan 039, Batch 5): the hand-written wrapper is gone — the
 * registered class is assembled from the card declaration, and
 * `$isHorizontalRuleNode` is canonical on the base node.
 */
export const HorizontalRuleNode = assembleCardNodeOnce(horizontalRuleDeclaration)
export type HorizontalRuleNode = InstanceType<typeof HorizontalRuleNode>

export function $createHorizontalRuleNode() {
  return new HorizontalRuleNode()
}
