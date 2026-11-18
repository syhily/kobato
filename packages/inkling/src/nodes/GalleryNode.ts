import type { GalleryNodeDataset } from '@kobato/inkling-internal/nodes/cards/card-commands'

import { assembleCardNodeOnce } from '@kobato/inkling-internal/nodes/assemble-card-node'
import { galleryDeclaration } from '@kobato/inkling-internal/nodes/cards/gallery.declaration'
export {
  ALLOWED_IMAGE_PROPS,
  $isGalleryNode,
  MAX_IMAGES,
  MAX_PER_ROW,
  recalculateImageRows,
} from '@kobato/inkling-internal/nodes/base/nodes/gallery/GalleryNode'
export type { SerializedGalleryNode } from '@kobato/inkling-internal/nodes/base/nodes/gallery/GalleryNode'
export { INSERT_GALLERY_COMMAND } from '@kobato/inkling-internal/nodes/cards/card-commands'
export type { GalleryNodeDataset } from '@kobato/inkling-internal/nodes/cards/card-commands'

/**
 * The registered class, assembled once from the card declaration by
 * `assembleCardNodeOnce`; `$isGalleryNode` and the image-list helpers are
 * canonical on the base node. The instance type carries the spec-derived `__*`
 * field map, so `$createGalleryNode` needs no cast.
 */
export const GalleryNode = assembleCardNodeOnce(galleryDeclaration)
export type GalleryNode = InstanceType<typeof GalleryNode>

export const $createGalleryNode = (dataset: GalleryNodeDataset): GalleryNode => {
  return new GalleryNode(dataset)
}
