import type { HeaderNodeDataset } from '@kobato/inkling-internal/nodes/cards/card-commands'

import { assembleCardNodeOnce } from '@kobato/inkling-internal/nodes/assemble-card-node'
import { headerDeclaration } from '@kobato/inkling-internal/nodes/cards/header.declaration'
export { $isHeaderNode } from '@kobato/inkling-internal/nodes/base/nodes/header/HeaderNode'
export { INSERT_HEADER_COMMAND } from '@kobato/inkling-internal/nodes/cards/card-commands'
export type { HeaderNodeDataset } from '@kobato/inkling-internal/nodes/cards/card-commands'

/**
 * The registered class, assembled once from the card declaration by
 * `assembleCardNodeOnce`; `$isHeaderNode` is canonical on the base node. The
 * instance type carries the spec-derived `__*` field map, so `$createHeaderNode`
 * needs no cast.
 */
export const HeaderNode = assembleCardNodeOnce(headerDeclaration)
export type HeaderNode = InstanceType<typeof HeaderNode>

export const $createHeaderNode = (dataset: HeaderNodeDataset): HeaderNode => {
  return new HeaderNode(dataset)
}
