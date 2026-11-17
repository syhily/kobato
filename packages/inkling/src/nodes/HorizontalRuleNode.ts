import { assembleCardNodeOnce } from './assemble-card-node'
import { horizontalRuleDeclaration } from './cards/horizontalrule.declaration'

export { $isHorizontalRuleNode } from './base/nodes/horizontalrule/HorizontalRuleNode'
export { INSERT_HORIZONTAL_RULE_COMMAND } from './cards/card-commands'

/**
 * The registered class is assembled from the card declaration, and
 * `$isHorizontalRuleNode` is canonical on the base node.
 */
export const HorizontalRuleNode = assembleCardNodeOnce(horizontalRuleDeclaration)
export type HorizontalRuleNode = InstanceType<typeof HorizontalRuleNode>

export function $createHorizontalRuleNode() {
  return new HorizontalRuleNode()
}
