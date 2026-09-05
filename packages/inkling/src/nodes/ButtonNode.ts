import type { ButtonNodeDataset } from '@/nodes/cards/card-commands'

import { assembleCardNodeOnce } from '@/nodes/assemble-card-node'
import { buttonDeclaration } from '@/nodes/cards/button.declaration'
export { $isButtonNode } from '@/nodes/base/nodes/button/ButtonNode'
export type { SerializedButtonNode } from '@/nodes/base/nodes/button/ButtonNode'
export { INSERT_BUTTON_COMMAND } from '@/nodes/cards/card-commands'
export type { ButtonNodeDataset } from '@/nodes/cards/card-commands'

/**
 * Transition shim (plan 039, Batch 5): the hand-written wrapper is gone — the
 * registered class is assembled from the card declaration, and `$isButtonNode`
 * is canonical on the base node.
 */
export const ButtonNode = assembleCardNodeOnce(buttonDeclaration)
export type ButtonNode = InstanceType<typeof ButtonNode>

export const $createButtonNode = (dataset?: ButtonNodeDataset): ButtonNode => {
  return new ButtonNode(dataset)
}
