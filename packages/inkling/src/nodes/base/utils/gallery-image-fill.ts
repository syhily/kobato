import type { GalleryImage } from '@kobato/inkling-internal/types/gallery'

import { getImageFilenameFromSrc } from '@kobato/inkling-internal/nodes/base/utils/content-image-url'

export interface GalleryImageFillOptions {
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
