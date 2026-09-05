import { describe, expect, it } from 'vitest'

import { toImageDataset } from '@/components/ui/LibraryPlugin'

// toImageDataset is the library flow's only field-mapping point (plan C8
// §3.4): the four card fields always land (with their defaults), the three
// host-schema keys ride along only when the item carries them.
describe('toImageDataset', () => {
  it('maps every field, including the host-schema pass-through keys', () => {
    expect(
      toImageDataset({
        src: '/content/images/cat.jpg',
        alt: 'A cat',
        width: 1200,
        height: 800,
        thumbhash: '1QcSHQRnh493V4dIh4eXh1h4kJUI',
        storagePath: '2026/07/cat.jpg',
        imageId: 'img_123',
      }),
    ).toEqual({
      src: '/content/images/cat.jpg',
      alt: 'A cat',
      width: 1200,
      height: 800,
      thumbhash: '1QcSHQRnh493V4dIh4eXh1h4kJUI',
      storagePath: '2026/07/cat.jpg',
      imageId: 'img_123',
    })
  })

  it('defaults a missing alt to an empty string', () => {
    expect(toImageDataset({ src: '/content/images/cat.jpg' }).alt).toBe('')
  })

  it('defaults missing dimensions to null (the card backfills them on load)', () => {
    const dataset = toImageDataset({ src: '/content/images/cat.jpg' })

    expect(dataset.width).toBeNull()
    expect(dataset.height).toBeNull()
  })

  it('keeps explicit null dimensions as null', () => {
    const dataset = toImageDataset({ src: '/content/images/cat.jpg', width: null, height: null })

    expect(dataset.width).toBeNull()
    expect(dataset.height).toBeNull()
  })

  it('omits the host-schema keys unless the item carries them', () => {
    const dataset = toImageDataset({ src: '/content/images/cat.jpg' })

    expect(dataset).not.toHaveProperty('thumbhash')
    expect(dataset).not.toHaveProperty('storagePath')
    expect(dataset).not.toHaveProperty('imageId')
  })

  it('carries each host-schema key independently', () => {
    expect(toImageDataset({ src: '/a.jpg', imageId: 'img_1' })).toEqual({
      src: '/a.jpg',
      alt: '',
      width: null,
      height: null,
      imageId: 'img_1',
    })
    expect(toImageDataset({ src: '/b.jpg', thumbhash: 'abc' })).toEqual({
      src: '/b.jpg',
      alt: '',
      width: null,
      height: null,
      thumbhash: 'abc',
    })
    expect(toImageDataset({ src: '/c.jpg', storagePath: '2026/c.jpg' })).toEqual({
      src: '/c.jpg',
      alt: '',
      width: null,
      height: null,
      storagePath: '2026/c.jpg',
    })
  })
})
