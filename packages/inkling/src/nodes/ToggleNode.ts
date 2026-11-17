import type { ToggleNodeDataset } from './cards/card-commands'

import { assembleCardNodeOnce } from './assemble-card-node'
import { toggleDeclaration } from './cards/toggle.declaration'
export { $isToggleNode } from './base/nodes/toggle/ToggleNode'
export type { SerializedToggleNode } from './base/nodes/toggle/ToggleNode'
export { INSERT_TOGGLE_COMMAND } from './cards/card-commands'
export type { ToggleNodeDataset } from './cards/card-commands'

/**
 * The registered class, assembled once from the card declaration by
 * `assembleCardNodeOnce`; `$isToggleNode` is canonical on the base node. The
 * instance type carries the spec-derived `__*` field map, so `$createToggleNode`
 * needs no cast.
 */
export const ToggleNode = assembleCardNodeOnce(toggleDeclaration)
export type ToggleNode = InstanceType<typeof ToggleNode>

export const $createToggleNode = (dataset?: ToggleNodeDataset): ToggleNode => {
  return new ToggleNode(dataset)
}
