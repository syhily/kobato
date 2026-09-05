import type { NodeKey } from 'lexical'

import type { ImageNodeDataset } from '@/nodes/cards/card-commands'

import { assembleCardNodeOnce } from '@/nodes/assemble-card-node'
import { imageDeclaration } from '@/nodes/cards/image.declaration'
export { $isImageNode } from '@/nodes/base/nodes/image/ImageNode'
export type { SerializedImageNode } from '@/nodes/base/nodes/image/ImageNode'
export { INSERT_IMAGE_COMMAND } from '@/nodes/cards/card-commands'
export type { ImageNodeDataset } from '@/nodes/cards/card-commands'

/**
 * The registered class is assembled from the card declaration, and
 * `$isImageNode` and the upload accessors are canonical on the base node.
 * The instance type carries the spec-derived `__*` field map (names and
 * value types from the declaration's spec via CardSpecFieldMap), so
 * `$createImageNode` constructs the assembled class — which initializes the
 * nested-editor and transient-prop specs — with no cast.
 */
export const ImageNode = assembleCardNodeOnce(imageDeclaration)
export type ImageNode = InstanceType<typeof ImageNode>

export const $createImageNode = (dataset: ImageNodeDataset = {}, key?: NodeKey): ImageNode => {
  // the nested-editor and transient fields are initialized by the constructor from the dataset
  return new ImageNode(dataset, key)
}
