import type { ToggleNodeDataset } from '@kobato/inkling-internal/nodes/cards/card-commands'

import { assembleCardNodeOnce } from '@kobato/inkling-internal/nodes/assemble-card-node'
import { toggleDeclaration } from '@kobato/inkling-internal/nodes/cards/toggle.declaration'
export { $isToggleNode } from '@kobato/inkling-internal/nodes/base/nodes/toggle/ToggleNode'
export type { SerializedToggleNode } from '@kobato/inkling-internal/nodes/base/nodes/toggle/ToggleNode'
export { INSERT_TOGGLE_COMMAND } from '@kobato/inkling-internal/nodes/cards/card-commands'
export type { ToggleNodeDataset } from '@kobato/inkling-internal/nodes/cards/card-commands'

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
