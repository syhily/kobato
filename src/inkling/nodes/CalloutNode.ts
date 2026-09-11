import type { CalloutNodeDataset } from '@/inkling/nodes/cards/card-commands'

import { assembleCardNodeOnce } from '@/inkling/nodes/assemble-card-node'
import { calloutDeclaration } from '@/inkling/nodes/cards/callout.declaration'
export { $isCalloutNode } from '@/inkling/nodes/base/nodes/callout/CalloutNode'
export type { SerializedCalloutNode } from '@/inkling/nodes/base/nodes/callout/CalloutNode'
export { INSERT_CALLOUT_COMMAND } from '@/inkling/nodes/cards/card-commands'
export type { CalloutNodeDataset } from '@/inkling/nodes/cards/card-commands'

/**
 * The registered class is assembled from the card declaration, and
 * `$isCalloutNode` is canonical on the base node. The instance type carries
 * the spec-derived `__*` field map (names and value types from the
 * declaration's spec via CardSpecFieldMap), so `$createCalloutNode`
 * constructs the assembled class — which sets up the nested-editor spec —
 * with no cast.
 */
export const CalloutNode = assembleCardNodeOnce(calloutDeclaration)
export type CalloutNode = InstanceType<typeof CalloutNode>

export const $createCalloutNode = (dataset: CalloutNodeDataset): CalloutNode => {
  // the nested-editor fields are set up by the constructor from the dataset
  return new CalloutNode(dataset)
}
