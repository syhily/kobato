import type { GalleryImage } from '@/types/gallery'

import { getImageFilenameFromSrc } from '@/nodes/base/utils/content-image-url'

/**
 * The one fill policy mapping an image card's drag dataset onto the
 * GalleryImage shape (CONTEXT.md "gallery images mirror" persists only
 * ALLOWED_IMAGE_PROPS — this mapping is what decides which dataset fields
 * survive a drop). Previously in two homes — the drop surgery (alt, no
 * row, the filename fallback applied to the dataset beforehand) and the
 * gallery drop (row, the probe fallback, no alt) — so which fields
 * survived depended on the drag direction.
 *
 * Policy: src is required (a dataset without one is not an image, and the
 * caller rejects the drop); the filename falls back to the src-derived one
 * inside the mapping; width/height fall back to the probe's natural size
 * (the one DOM read, injected); alt, row, and caption carry when present.
 */

export interface GalleryImageFillOptions {
  /** The dragged element's natural size — injected so the policy is testable without layout. */
  naturalSize?: { width?: number; height?: number } | null
}

export function datasetToGalleryImage(
  dataset: Record<string, unknown>,
  { naturalSize }: GalleryImageFillOptions = {},
): GalleryImage | null {
  if (typeof dataset.src !== 'string' || dataset.src === '') {
    return null
  }
  return {
    src: dataset.src,
    fileName:
      typeof dataset.fileName === 'string' && dataset.fileName
        ? dataset.fileName
        : getImageFilenameFromSrc(dataset.src),
    row: typeof dataset.row === 'number' ? dataset.row : undefined,
    width: typeof dataset.width === 'number' ? dataset.width : (naturalSize?.width ?? undefined),
    height: typeof dataset.height === 'number' ? dataset.height : (naturalSize?.height ?? undefined),
    alt: typeof dataset.alt === 'string' ? dataset.alt : undefined,
    caption: typeof dataset.caption === 'string' ? dataset.caption : undefined,
  }
}
