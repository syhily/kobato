import type { ToggleNodeDataset } from '@/inkling/nodes/cards/card-commands'

import { assembleCardNodeOnce } from '@/inkling/nodes/assemble-card-node'
import { toggleDeclaration } from '@/inkling/nodes/cards/toggle.declaration'
export { $isToggleNode } from '@/inkling/nodes/base/nodes/toggle/ToggleNode'
export type { SerializedToggleNode } from '@/inkling/nodes/base/nodes/toggle/ToggleNode'
export { INSERT_TOGGLE_COMMAND } from '@/inkling/nodes/cards/card-commands'
export type { ToggleNodeDataset } from '@/inkling/nodes/cards/card-commands'

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
