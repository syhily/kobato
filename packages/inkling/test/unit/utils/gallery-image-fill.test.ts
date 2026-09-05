import { describe, expect, it } from 'vitest'

import { datasetToGalleryImage } from '@/nodes/base/utils/gallery-image-fill'

describe('datasetToGalleryImage', () => {
  it('rejects a dataset without a usable src', () => {
    expect(datasetToGalleryImage({})).toBeNull()
    expect(datasetToGalleryImage({ src: '' })).toBeNull()
    expect(datasetToGalleryImage({ src: 42 })).toBeNull()
  })

  it('derives the filename from the src when the dataset lacks one', () => {
    expect(datasetToGalleryImage({ src: '/content/images/photo.png' })?.fileName).toBe('photo.png')
    expect(datasetToGalleryImage({ src: '/x/y.png', fileName: 'explicit.jpg' })?.fileName).toBe('explicit.jpg')
  })

  it('carries alt, row, and caption — whichever drag direction produced the dataset', () => {
    const image = datasetToGalleryImage({ src: '/a.png', alt: 'Alt text', row: 2, caption: 'A caption' })
    expect(image).toMatchObject({ alt: 'Alt text', row: 2, caption: 'A caption' })
  })

  it('falls back to the probe natural size only when the dataset lacks dimensions', () => {
    const naturalSize = { width: 800, height: 600 }
    expect(datasetToGalleryImage({ src: '/a.png' }, { naturalSize })).toMatchObject({ width: 800, height: 600 })
    // image card datasets allow null dimensions — null falls back too
    expect(datasetToGalleryImage({ src: '/a.png', width: null }, { naturalSize })).toMatchObject({
      width: 800,
      height: 600,
    })
    expect(datasetToGalleryImage({ src: '/a.png', width: 100, height: 50 }, { naturalSize })).toMatchObject({
      width: 100,
      height: 50,
    })
    expect(datasetToGalleryImage({ src: '/a.png' })?.width).toBeUndefined()
  })
})
