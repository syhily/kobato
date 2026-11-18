import type { CalloutNodeDataset } from '@kobato/inkling-internal/nodes/cards/card-commands'

import { assembleCardNodeOnce } from '@kobato/inkling-internal/nodes/assemble-card-node'
import { calloutDeclaration } from '@kobato/inkling-internal/nodes/cards/callout.declaration'
export { $isCalloutNode } from '@kobato/inkling-internal/nodes/base/nodes/callout/CalloutNode'
export type { SerializedCalloutNode } from '@kobato/inkling-internal/nodes/base/nodes/callout/CalloutNode'
export { INSERT_CALLOUT_COMMAND } from '@kobato/inkling-internal/nodes/cards/card-commands'
export type { CalloutNodeDataset } from '@kobato/inkling-internal/nodes/cards/card-commands'

/**
 * The registered class, assembled once from the card declaration by
 * `assembleCardNodeOnce`; `$isCalloutNode` is canonical on the base node. The
 * instance type carries the spec-derived `__*` field map, so `$createCalloutNode`
 * needs no cast.
 */
export const CalloutNode = assembleCardNodeOnce(calloutDeclaration)
export type CalloutNode = InstanceType<typeof CalloutNode>

export const $createCalloutNode = (dataset: CalloutNodeDataset): CalloutNode => {
  return new CalloutNode(dataset)
}
