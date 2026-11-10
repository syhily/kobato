/**
 * The application half of the gallery drag-and-drop: reorder-rules decides, this module
 * applies — external add, internal reorder splice, drag-out source removal — as pure
 * transitions over plain data; the one DOM read arrives behind the probe port.
 */

import type { GalleryImage } from '@/inkling/types/gallery'

import { datasetToGalleryImage } from '@/inkling/nodes/base/utils/gallery-image-fill'
import { adjustInsertIndexForRemoval } from '@/inkling/utils/draggable/reorder-rules'

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

/** The dragged element's natural size — the one DOM read, injected so the policy is testable without layout. */
export interface GalleryDropProbe {
  naturalSize: { width?: number; height?: number } | null
}

export const NULL_GALLERY_PROBE: GalleryDropProbe = { naturalSize: null }

export function isGalleryImageDrag(facts: { type?: string; cardName?: string }): boolean {
  return facts.type === 'image' || facts.cardName === 'image'
}

/**
 * Applies a resolved drop to the images list, returning the new list or null to reject. An
 * external image (`draggableIndex` -1) is added; an internal image is re-ordered by splice.
 * An empty gallery has no droppables to derive an index from (the drop is container-level),
 * so the first image deliberately lands at slot 0.
 */
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
    // Image card datasets may not carry every detail; the shared fill policy (filename
    // fallback, probe natural size) completes them and rejects a src-less dataset.
    const newImage = datasetToGalleryImage(dataset, { naturalSize: probe.naturalSize })
    if (!newImage) {
      return null
    }

    const updatedImages = [...images]
    updatedImages.splice(slot, 0, newImage)
    return updatedImages
  }

  // Located by position, not by src value: duplicate srcs (or preview-phase images whose
  // src is still undefined) would make a value find grab the wrong instance.
  const draggedImage = images[draggableIndex]
  if (!draggedImage) {
    return null
  }
  const filtered = images.filter((_, index) => index !== draggableIndex)
  filtered.splice(adjustInsertIndexForRemoval(draggableIndex, slot), 0, draggedImage)
  return filtered
}

/**
 * The drag-out source removal: the dragged image leaves the list when its drop succeeded in
 * another container. Located by position (the same duplicate-src reason as the reorder
 * path). Returns null when the index is out of range.
 */
export function resolveGallerySourceRemoval(images: GalleryImage[], draggableIndex: number): GalleryImage[] | null {
  if (draggableIndex < 0 || draggableIndex >= images.length) {
    return null
  }
  return images.filter((_, index) => index !== draggableIndex)
}
