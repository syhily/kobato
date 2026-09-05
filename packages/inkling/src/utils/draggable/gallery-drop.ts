/**
 * Gallery drop — the application half of a gallery drag-and-drop: the list
 * level counterpart of the drop surgery (CONTEXT.md: "reorder rules decide;
 * drop surgery applies"). The geometry half stays in reorder-rules; this
 * module owns what a resolved drop DOES to the images list — the external
 * add (dataset → GalleryImage fill), the internal reorder splice, and the
 * drag-out source removal — as pure transitions over plain data, so the
 * policy matrix is a synchronous test table. The one DOM read (the dragged
 * element's natural size) arrives behind the probe port. `useGalleryReorder`
 * is the adapter: DOM wiring, the geometry resolution, and the
 * updateImages/refresh/result-protocol mapping.
 */

import type { GalleryImage } from '@/types/gallery'

import { datasetToGalleryImage } from '@/nodes/base/utils/gallery-image-fill'
import { adjustInsertIndexForRemoval } from '@/utils/draggable/reorder-rules'

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

/** The gallery's drop allowance: only image drags (cards or loose images) are ever considered. */
export function isGalleryImageDrag(facts: { type?: string; cardName?: string }): boolean {
  return facts.type === 'image' || facts.cardName === 'image'
}

/**
 * Applies a resolved drop to the images list, returning the new list — or
 * null to reject. An external image (`draggableIndex` -1) is added with its
 * dataset fields filled from the probe where the dataset lacks them; an
 * internal image is re-ordered by splice. An empty gallery has no droppables
 * to derive an index from (the drop is container-level), so the first image
 * deliberately lands at slot 0.
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
    // external image being added: image card datasets may not have all of
    // the details we need — the shared fill policy (filename fallback,
    // probe natural size) completes them, and rejects a src-less dataset
    const newImage = datasetToGalleryImage(dataset, { naturalSize: probe.naturalSize })
    if (!newImage) {
      return null
    }

    const updatedImages = [...images]
    updatedImages.splice(slot, 0, newImage)
    return updatedImages
  }

  // internal image being re-ordered: located by position, not by src value —
  // duplicate srcs (or preview-phase images whose src is still undefined)
  // would make a value find grab the wrong instance
  const draggedImage = images[draggableIndex]
  if (!draggedImage) {
    return null
  }
  const filtered = images.filter((_, index) => index !== draggableIndex)
  filtered.splice(adjustInsertIndexForRemoval(draggableIndex, slot), 0, draggedImage)
  return filtered
}

/**
 * The drag-out source removal: the dragged image leaves the gallery's list
 * when its drop succeeded in another container. Located by position (the same
 * draggableIndex ordinal as the reorder path) for the same duplicate-src
 * reason. Returns the new list, or null when the index is out of range.
 */
export function resolveGallerySourceRemoval(images: GalleryImage[], draggableIndex: number): GalleryImage[] | null {
  if (draggableIndex < 0 || draggableIndex >= images.length) {
    return null
  }
  return images.filter((_, index) => index !== draggableIndex)
}
