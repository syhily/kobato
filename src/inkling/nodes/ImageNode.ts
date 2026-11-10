import type { NodeKey } from 'lexical'

import type { ImageNodeDataset } from '@/inkling/nodes/cards/card-commands'

import { assembleCardNodeOnce } from '@/inkling/nodes/assemble-card-node'
import { imageDeclaration } from '@/inkling/nodes/cards/image.declaration'
export { $isImageNode } from '@/inkling/nodes/base/nodes/image/ImageNode'
export type { SerializedImageNode } from '@/inkling/nodes/base/nodes/image/ImageNode'
export { INSERT_IMAGE_COMMAND } from '@/inkling/nodes/cards/card-commands'
export type { ImageNodeDataset } from '@/inkling/nodes/cards/card-commands'

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
