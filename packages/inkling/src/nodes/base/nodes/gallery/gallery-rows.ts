import type { GalleryImage } from '@kobato/inkling-internal/types/gallery'

export const MAX_IMAGES = 9
export const MAX_PER_ROW = 3

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
