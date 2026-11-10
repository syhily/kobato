import type { MathNodeDataset } from '@/inkling/nodes/cards/card-commands'

import { assembleCardNodeOnce } from '@/inkling/nodes/assemble-card-node'
import { mathDeclaration } from '@/inkling/nodes/cards/math.declaration'
export { $isMathNode } from '@/inkling/nodes/base/nodes/math/MathNode'
export { INSERT_MATH_COMMAND } from '@/inkling/nodes/cards/card-commands'
export type { MathNodeDataset } from '@/inkling/nodes/cards/card-commands'

/**
 * The registered class, assembled once from the card declaration by
 * `assembleCardNodeOnce`; `$isMathNode` is canonical on the base node.
 */
export const MathNode = assembleCardNodeOnce(mathDeclaration)
export type MathNode = InstanceType<typeof MathNode>

export function $createMathNode(dataset: MathNodeDataset): MathNode {
  return new MathNode(dataset)
}
