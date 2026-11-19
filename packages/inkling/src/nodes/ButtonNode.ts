import type { ButtonNodeDataset } from '@kobato/inkling-internal/nodes/cards/card-commands'

import { assembleCardNodeOnce } from '@kobato/inkling-internal/nodes/assemble-card-node'
import { buttonDeclaration } from '@kobato/inkling-internal/nodes/cards/button.declaration'
export { $isButtonNode } from '@kobato/inkling-internal/nodes/base/nodes/button/ButtonNode'
export type { SerializedButtonNode } from '@kobato/inkling-internal/nodes/base/nodes/button/ButtonNode'
export { INSERT_BUTTON_COMMAND } from '@kobato/inkling-internal/nodes/cards/card-commands'
export type { ButtonNodeDataset } from '@kobato/inkling-internal/nodes/cards/card-commands'

export const ButtonNode = assembleCardNodeOnce(buttonDeclaration)
export type ButtonNode = InstanceType<typeof ButtonNode>
export const $createButtonNode = (dataset?: ButtonNodeDataset): ButtonNode => {
  return new ButtonNode(dataset)
}
