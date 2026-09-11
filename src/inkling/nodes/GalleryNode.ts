import type { GalleryNodeDataset } from '@/inkling/nodes/cards/card-commands'

import { assembleCardNodeOnce } from '@/inkling/nodes/assemble-card-node'
import { galleryDeclaration } from '@/inkling/nodes/cards/gallery.declaration'
export {
  ALLOWED_IMAGE_PROPS,
  $isGalleryNode,
  MAX_IMAGES,
  MAX_PER_ROW,
  recalculateImageRows,
} from '@/inkling/nodes/base/nodes/gallery/GalleryNode'
export type { SerializedGalleryNode } from '@/inkling/nodes/base/nodes/gallery/GalleryNode'
export { INSERT_GALLERY_COMMAND } from '@/inkling/nodes/cards/card-commands'
export type { GalleryNodeDataset } from '@/inkling/nodes/cards/card-commands'

/**
 * The registered class is assembled from the card declaration, and
 * `$isGalleryNode` and the image-list helpers are canonical on the base
 * node. The instance type carries the spec-derived `__*` field map (names
 * and value types from the declaration's spec via CardSpecFieldMap), so
 * `$createGalleryNode` constructs the assembled class — which sets up the
 * nested-editor spec — with no cast.
 */
export const GalleryNode = assembleCardNodeOnce(galleryDeclaration)
export type GalleryNode = InstanceType<typeof GalleryNode>

export const $createGalleryNode = (dataset: GalleryNodeDataset): GalleryNode => {
  // the nested-editor fields are set up by the constructor from the dataset
  return new GalleryNode(dataset)
}
