import type { GalleryImage } from '@kobato/inkling-internal/types/gallery'

import { datasetToGalleryImage } from '@kobato/inkling-internal/nodes/base/utils/gallery-image-fill'
import { adjustInsertIndexForRemoval } from '@kobato/inkling-internal/utils/draggable/reorder-rules'

export interface GalleryDragFacts {
  type?: string
  cardName?: string
  dataset: {
    src?: unknown
    width?: unknown
    height?: unknown
    fileName?: unknown
    row?: unknown
    caption?: unknown
  }
}

export interface GalleryDropProbe {
  naturalSize: { width?: number; height?: number } | null
}

export const NULL_GALLERY_PROBE: GalleryDropProbe = { naturalSize: null }

export function isGalleryImageDrag(facts: { type?: string; cardName?: string }): boolean {
  return facts.type === 'image' || facts.cardName === 'image'
}

export function resolveGalleryDrop(
  images: GalleryImage[],
  facts: GalleryDragFacts,
  draggableIndex: number,
  insertIndex: number,
  probe: GalleryDropProbe = NULL_GALLERY_PROBE,
): GalleryImage[] | null {
  if (!isGalleryImageDrag(facts)) {
    return null
  }

  const slot = images.length === 0 ? 0 : insertIndex
  const { dataset } = facts

  if (draggableIndex === -1) {
    const newImage = datasetToGalleryImage(dataset, { naturalSize: probe.naturalSize })
    if (!newImage) {
      return null
    }

    const updatedImages = [...images]
    updatedImages.splice(slot, 0, newImage)
    return updatedImages
  }

  const draggedImage = images[draggableIndex]
  if (!draggedImage) {
    return null
  }
  const filtered = images.filter((_, index) => index !== draggableIndex)
  filtered.splice(adjustInsertIndexForRemoval(draggableIndex, slot), 0, draggedImage)
  return filtered
}

export function resolveGallerySourceRemoval(images: GalleryImage[], draggableIndex: number): GalleryImage[] | null {
  if (draggableIndex < 0 || draggableIndex >= images.length) {
    return null
  }
  return images.filter((_, index) => index !== draggableIndex)
}
