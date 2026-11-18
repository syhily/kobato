import type { ImageNodeDataset } from '@kobato/inkling-internal/nodes/cards/card-commands'
import type { NodeKey } from 'lexical'

import { assembleCardNodeOnce } from '@kobato/inkling-internal/nodes/assemble-card-node'
import { imageDeclaration } from '@kobato/inkling-internal/nodes/cards/image.declaration'
export { $isImageNode } from '@kobato/inkling-internal/nodes/base/nodes/image/ImageNode'
export type { SerializedImageNode } from '@kobato/inkling-internal/nodes/base/nodes/image/ImageNode'
export { INSERT_IMAGE_COMMAND } from '@kobato/inkling-internal/nodes/cards/card-commands'
export type { ImageNodeDataset } from '@kobato/inkling-internal/nodes/cards/card-commands'

/**
 * The registered class, assembled once from the card declaration by
 * `assembleCardNodeOnce`; `$isImageNode` and the upload accessors are canonical
 * on the base node. The instance type carries the spec-derived `__*` field map,
 * so `$createImageNode` needs no cast.
 */
export const ImageNode = assembleCardNodeOnce(imageDeclaration)
export type ImageNode = InstanceType<typeof ImageNode>

export const $createImageNode = (dataset: ImageNodeDataset = {}, key?: NodeKey): ImageNode => {
  return new ImageNode(dataset, key)
}
