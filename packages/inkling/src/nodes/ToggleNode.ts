import type { ToggleNodeDataset } from '@kobato/inkling-internal/nodes/cards/card-commands'

import { assembleCardNodeOnce } from '@kobato/inkling-internal/nodes/assemble-card-node'
import { toggleDeclaration } from '@kobato/inkling-internal/nodes/cards/toggle.declaration'
export { $isToggleNode } from '@kobato/inkling-internal/nodes/base/nodes/toggle/ToggleNode'
export type { SerializedToggleNode } from '@kobato/inkling-internal/nodes/base/nodes/toggle/ToggleNode'
export { INSERT_TOGGLE_COMMAND } from '@kobato/inkling-internal/nodes/cards/card-commands'
export type { ToggleNodeDataset } from '@kobato/inkling-internal/nodes/cards/card-commands'

export const ToggleNode = assembleCardNodeOnce(toggleDeclaration)
export type ToggleNode = InstanceType<typeof ToggleNode>
export const $createToggleNode = (dataset?: ToggleNodeDataset): ToggleNode => {
  return new ToggleNode(dataset)
}
