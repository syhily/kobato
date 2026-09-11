import type { ToggleNodeDataset } from '@/inkling/nodes/cards/card-commands'

import { assembleCardNodeOnce } from '@/inkling/nodes/assemble-card-node'
import { toggleDeclaration } from '@/inkling/nodes/cards/toggle.declaration'
export { $isToggleNode } from '@/inkling/nodes/base/nodes/toggle/ToggleNode'
export type { SerializedToggleNode } from '@/inkling/nodes/base/nodes/toggle/ToggleNode'
export { INSERT_TOGGLE_COMMAND } from '@/inkling/nodes/cards/card-commands'
export type { ToggleNodeDataset } from '@/inkling/nodes/cards/card-commands'

/**
 * The registered class is assembled once from the card declaration, and
 * `$isToggleNode` is canonical on the base node. The instance type carries
 * the spec-derived `__*` field map (names and value types from the
 * declaration's spec via CardSpecFieldMap), so `$createToggleNode`
 * constructs the assembled class — which sets up the nested-editor spec —
 * with no cast.
 */
export const ToggleNode = assembleCardNodeOnce(toggleDeclaration)
export type ToggleNode = InstanceType<typeof ToggleNode>

export const $createToggleNode = (dataset?: ToggleNodeDataset): ToggleNode => {
  // the nested-editor fields are set up by the constructor from the dataset
  return new ToggleNode(dataset)
}
