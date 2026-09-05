import type { GalleryImage } from '@/types/gallery'

// Gallery layout caps: at most 3 images per row, at most 9 images per gallery.
// Owned here (the row-layout module) so the export renderer, the React
// preview, and the node all read one source — the constants used to live on
// GalleryNode.ts, forcing the renderer/parser into an import cycle with it.
export const MAX_IMAGES = 9
export const MAX_PER_ROW = 3

/**
 * The one gallery row-layout rule, shared by the export renderer
 * (gallery-renderer.ts) and the React preview (GalleryCard.tsx): each image
 * keeps its stored `row` (naive ceil division assigned by
 * `recalculateImageRows`), except that a count leaving a single image on the
 * last row (`n % MAX_PER_ROW === 1`) bumps the second-to-last image down one
 * row, so the gallery ends 2+2 instead of 3+1.
 *
 * The result is indexed by row number and stays sparse when stored rows skip
 * an index — both consumers iterate it with hole-skipping array methods.
 */
export function buildGalleryRows<T extends Pick<GalleryImage, 'row'>>(images: T[]): T[][] {
  const rows: T[][] = []
  const noOfImages = images.length

  images.forEach((image, idx) => {
    let row = image.row ?? 0

    if (noOfImages > 1 && noOfImages % MAX_PER_ROW === 1 && idx === noOfImages - 2) {
      row = row + 1
    }
    if (!rows[row]) {
      rows[row] = []
    }

    rows[row].push(image)
  })

  return rows
}
