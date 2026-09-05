import { MAX_PER_ROW, buildGalleryRows } from '@/nodes/base/nodes/gallery/gallery-rows'

// the stored `row` assignment is naive ceil division (recalculateImageRows);
// buildGalleryRows layers the single-image-last-row bump on top of it
function makeImages(count: number) {
  return Array.from({ length: count }, (_, idx) => ({
    fileName: `image-${idx}.jpg`,
    row: Math.floor(idx / MAX_PER_ROW),
  }))
}

function rowSizes(count: number) {
  return buildGalleryRows(makeImages(count)).map((row) => row.length)
}

describe('buildGalleryRows', function () {
  it('lays out a single image in one row', function () {
    expect(rowSizes(1)).toEqual([1])
  })

  it('lays out a full row without bumping', function () {
    expect(rowSizes(3)).toEqual([3])
  })

  it('bumps the second-to-last image when the last row would hold a single image', function () {
    const rows = buildGalleryRows(makeImages(4))

    expect(rows.map((row) => row.length)).toEqual([2, 2])
    expect(rows[0].map((image) => image.fileName)).toEqual(['image-0.jpg', 'image-1.jpg'])
    expect(rows[1].map((image) => image.fileName)).toEqual(['image-2.jpg', 'image-3.jpg'])
  })

  it('bumps the second-to-last image for seven images', function () {
    expect(rowSizes(7)).toEqual([3, 2, 2])
  })

  it('bumps the second-to-last image for ten images', function () {
    expect(rowSizes(10)).toEqual([3, 3, 2, 2])
  })
})
