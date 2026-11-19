import type { MathNodeDataset } from '@kobato/inkling-internal/nodes/cards/card-commands'

import { assembleCardNodeOnce } from '@kobato/inkling-internal/nodes/assemble-card-node'
import { mathDeclaration } from '@kobato/inkling-internal/nodes/cards/math.declaration'
export { $isMathNode } from '@kobato/inkling-internal/nodes/base/nodes/math/MathNode'
export { INSERT_MATH_COMMAND } from '@kobato/inkling-internal/nodes/cards/card-commands'
export type { MathNodeDataset } from '@kobato/inkling-internal/nodes/cards/card-commands'

export const MathNode = assembleCardNodeOnce(mathDeclaration)
export type MathNode = InstanceType<typeof MathNode>
export function $createMathNode(dataset: MathNodeDataset): MathNode {
  return new MathNode(dataset)
}
