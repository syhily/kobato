import { assembleCardNodeOnce } from '@/inkling/nodes/assemble-card-node'
import { horizontalRuleDeclaration } from '@/inkling/nodes/cards/horizontalrule.declaration'

export { $isHorizontalRuleNode } from '@/inkling/nodes/base/nodes/horizontalrule/HorizontalRuleNode'
export { INSERT_HORIZONTAL_RULE_COMMAND } from '@/inkling/nodes/cards/card-commands'

/**
 * The registered class is assembled from the card declaration, and
 * `$isHorizontalRuleNode` is canonical on the base node.
 */
export const HorizontalRuleNode = assembleCardNodeOnce(horizontalRuleDeclaration)
export type HorizontalRuleNode = InstanceType<typeof HorizontalRuleNode>

export function $createHorizontalRuleNode() {
  return new HorizontalRuleNode()
}
