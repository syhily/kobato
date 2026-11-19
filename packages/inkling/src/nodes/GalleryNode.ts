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

export const GalleryNode = assembleCardNodeOnce(galleryDeclaration)
export type GalleryNode = InstanceType<typeof GalleryNode>
export const $createGalleryNode = (dataset: GalleryNodeDataset): GalleryNode => {
  return new GalleryNode(dataset)
}
