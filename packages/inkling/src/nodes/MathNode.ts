import type { MathNodeDataset } from './cards/card-commands'

import { assembleCardNodeOnce } from './assemble-card-node'
import { mathDeclaration } from './cards/math.declaration'
export { $isMathNode } from './base/nodes/math/MathNode'
export { INSERT_MATH_COMMAND } from './cards/card-commands'
export type { MathNodeDataset } from './cards/card-commands'

/**
 * The registered class, assembled once from the card declaration by
 * `assembleCardNodeOnce`; `$isMathNode` is canonical on the base node.
 */
export const MathNode = assembleCardNodeOnce(mathDeclaration)
export type MathNode = InstanceType<typeof MathNode>

export function $createMathNode(dataset: MathNodeDataset): MathNode {
  return new MathNode(dataset)
}
