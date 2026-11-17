import type { ButtonNodeDataset } from './cards/card-commands'

import { assembleCardNodeOnce } from './assemble-card-node'
import { buttonDeclaration } from './cards/button.declaration'
export { $isButtonNode } from './base/nodes/button/ButtonNode'
export type { SerializedButtonNode } from './base/nodes/button/ButtonNode'
export { INSERT_BUTTON_COMMAND } from './cards/card-commands'
export type { ButtonNodeDataset } from './cards/card-commands'

/**
 * The registered class, assembled once from the card declaration by
 * `assembleCardNodeOnce`; `$isButtonNode` is canonical on the base node.
 */
export const ButtonNode = assembleCardNodeOnce(buttonDeclaration)
export type ButtonNode = InstanceType<typeof ButtonNode>

export const $createButtonNode = (dataset?: ButtonNodeDataset): ButtonNode => {
  return new ButtonNode(dataset)
}
