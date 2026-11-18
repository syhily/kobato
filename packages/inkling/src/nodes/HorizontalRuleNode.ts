import { assembleCardNodeOnce } from '@kobato/inkling-internal/nodes/assemble-card-node'
import { horizontalRuleDeclaration } from '@kobato/inkling-internal/nodes/cards/horizontalrule.declaration'

export { $isHorizontalRuleNode } from '@kobato/inkling-internal/nodes/base/nodes/horizontalrule/HorizontalRuleNode'
export { INSERT_HORIZONTAL_RULE_COMMAND } from '@kobato/inkling-internal/nodes/cards/card-commands'

/**
 * The registered class is assembled from the card declaration, and
 * `$isHorizontalRuleNode` is canonical on the base node.
 */
export const HorizontalRuleNode = assembleCardNodeOnce(horizontalRuleDeclaration)
export type HorizontalRuleNode = InstanceType<typeof HorizontalRuleNode>

export function $createHorizontalRuleNode() {
  return new HorizontalRuleNode()
}
