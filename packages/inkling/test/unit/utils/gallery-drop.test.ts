import { describe, expect, it } from 'vitest'

import type { GalleryImage } from '@/types/gallery'

import { isGalleryImageDrag, resolveGalleryDrop, resolveGallerySourceRemoval } from '@/utils/draggable/gallery-drop'

function facts(dataset: Record<string, unknown>, overrides: { type?: string; cardName?: string } = { type: 'image' }) {
  return { ...overrides, dataset }
}

describe('isGalleryImageDrag', () => {
  it('accepts image drags and image cards, rejects everything else', () => {
    expect(isGalleryImageDrag({ type: 'image' })).toBe(true)
    expect(isGalleryImageDrag({ cardName: 'image' })).toBe(true)
    expect(isGalleryImageDrag({ type: 'file' })).toBe(false)
    expect(isGalleryImageDrag({})).toBe(false)
  })
})

describe('resolveGalleryDrop', () => {
  it('rejects non-image drags', () => {
    expect(resolveGalleryDrop([], facts({}, { type: 'file' }), -1, 0)).toBeNull()
  })

  it('adds an external image into an empty gallery at slot 0', () => {
    const result = resolveGalleryDrop([], facts({ src: 'https://example.com/a.jpg', width: 100, height: 200 }), -1, 0)

    expect(result).toEqual([
      {
        src: 'https://example.com/a.jpg',
        fileName: 'a.jpg',
        row: undefined,
        width: 100,
        height: 200,
        caption: undefined,
      },
    ])
  })

  it('rejects an external add without a string src', () => {
    expect(resolveGalleryDrop([], facts({}), -1, 0)).toBeNull()
  })

  it('inserts an external image at the resolved slot', () => {
    const images: GalleryImage[] = [{ src: 'https://example.com/one.jpg' }, { src: 'https://example.com/two.jpg' }]

    const result = resolveGalleryDrop(images, facts({ src: 'https://example.com/new.jpg' }), -1, 1)

    expect(result?.map((i) => i.src)).toEqual([
      'https://example.com/one.jpg',
      'https://example.com/new.jpg',
      'https://example.com/two.jpg',
    ])
  })

  it('fills missing dimensions from the probe and the fileName from the src', () => {
    const result = resolveGalleryDrop([], facts({ src: 'https://example.com/path/photo.png?size=large' }), -1, 0, {
      naturalSize: { width: 640, height: 480 },
    })

    expect(result?.[0]).toMatchObject({ width: 640, height: 480, fileName: 'photo.png' })
  })

  it('prefers dataset fields over the probe', () => {
    const result = resolveGalleryDrop([], facts({ src: 'https://example.com/a.jpg', width: 100 }), -1, 0, {
      naturalSize: { width: 640, height: 480 },
    })

    expect(result?.[0]).toMatchObject({ width: 100, height: 480 })
  })

  it('carries row and caption only when the dataset types them', () => {
    const result = resolveGalleryDrop([], facts({ src: 'https://example.com/a.jpg', row: 2, caption: 'hi' }), -1, 0)

    expect(result?.[0]).toMatchObject({ row: 2, caption: 'hi' })
  })

  it('reorders an internal image by splice', () => {
    const images: GalleryImage[] = [
      { src: 'https://example.com/one.jpg' },
      { src: 'https://example.com/two.jpg' },
      { src: 'https://example.com/three.jpg' },
    ]

    const result = resolveGalleryDrop(images, facts({ src: 'https://example.com/one.jpg' }), 0, 3)

    expect(result?.map((i) => i.src)).toEqual([
      'https://example.com/two.jpg',
      'https://example.com/three.jpg',
      'https://example.com/one.jpg',
    ])
  })

  it('adjusts the slot when the dragged image sits before it', () => {
    const images: GalleryImage[] = [
      { src: 'https://example.com/one.jpg' },
      { src: 'https://example.com/two.jpg' },
      { src: 'https://example.com/three.jpg' },
    ]

    // dragging index 2 to slot 0: removal adjusts nothing
    const forward = resolveGalleryDrop(images, facts({ src: 'https://example.com/three.jpg' }), 2, 0)
    expect(forward?.map((i) => i.src)).toEqual([
      'https://example.com/three.jpg',
      'https://example.com/one.jpg',
      'https://example.com/two.jpg',
    ])
  })

  it('rejects an internal reorder when the dragged index is out of range', () => {
    const images: GalleryImage[] = [{ src: 'https://example.com/one.jpg' }]

    expect(resolveGalleryDrop(images, facts({ src: 'https://example.com/one.jpg' }), 1, 0)).toBeNull()
  })

  it('reorders the instance at the dragged index when srcs are duplicated', () => {
    const images: GalleryImage[] = [
      { src: 'https://example.com/same.jpg', fileName: 'first.jpg' },
      { src: 'https://example.com/same.jpg', fileName: 'second.jpg' },
      { src: 'https://example.com/other.jpg' },
    ]

    // dragging index 1 (the second copy) to slot 0 must move that copy, not
    // the first one a src-value find would have grabbed
    const result = resolveGalleryDrop(images, facts({ src: 'https://example.com/same.jpg' }), 1, 0)

    expect(result?.map((i) => i.fileName)).toEqual(['second.jpg', 'first.jpg', undefined])
  })

  it('reorders preview-phase images whose src is still undefined by position', () => {
    const images: GalleryImage[] = [
      { previewSrc: 'blob:one' },
      { previewSrc: 'blob:two' },
      { src: 'https://example.com/three.jpg' },
    ]

    // dragging index 1: a src-value find would grab index 0 (the first
    // undefined src) instead
    const result = resolveGalleryDrop(images, facts({}), 1, 0)

    expect(result?.map((i) => i.previewSrc ?? i.src)).toEqual(['blob:two', 'blob:one', 'https://example.com/three.jpg'])
  })
})

describe('resolveGallerySourceRemoval', () => {
  it('removes the dragged image by index', () => {
    const images: GalleryImage[] = [{ src: 'https://example.com/one.jpg' }, { src: 'https://example.com/two.jpg' }]

    expect(resolveGallerySourceRemoval(images, 0)).toEqual([{ src: 'https://example.com/two.jpg' }])
  })

  it('removes the instance at the index when srcs are duplicated', () => {
    const images: GalleryImage[] = [
      { src: 'https://example.com/same.jpg', fileName: 'first.jpg' },
      { src: 'https://example.com/same.jpg', fileName: 'second.jpg' },
    ]

    expect(resolveGallerySourceRemoval(images, 1)).toEqual([
      { src: 'https://example.com/same.jpg', fileName: 'first.jpg' },
    ])
  })

  it('returns null when the index is out of range', () => {
    const images: GalleryImage[] = [{ src: 'https://example.com/one.jpg' }]

    expect(resolveGallerySourceRemoval(images, 1)).toBeNull()
    expect(resolveGallerySourceRemoval(images, -1)).toBeNull()
  })
})
