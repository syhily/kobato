import type { GalleryImage } from '@kobato/inkling-internal/types/gallery'

import { galleryUploadIntent, type UploadFn } from '@kobato/inkling-internal/nodes/upload-intent'
import { createPreviewLeasePool } from '@kobato/inkling-internal/utils/preview-lease'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

const ink_utils_get_image_dimensions = await import('@kobato/inkling-internal/utils/get-image-dimensions')
const getImageDimensionsSpy = vi
  .spyOn(ink_utils_get_image_dimensions, 'getImageDimensions')
  .mockImplementation(vi.fn() as never)
const getImageDimensions = getImageDimensionsSpy

afterAll(() => {
  vi.restoreAllMocks()
})

describe('galleryUploadIntent', () => {
  let setImages: Mock<(images: GalleryImage[]) => void>
  let setPreviewImages: Mock<(images: GalleryImage[]) => void>
  let setErrorMessage: Mock<(message: string) => void>
  let createObjectURLSpy: ReturnType<typeof vi.spyOn>
  let revokeObjectURLSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    getImageDimensions.mockResolvedValue({ width: 100, height: 50 })
    setImages = vi.fn()
    setPreviewImages = vi.fn()
    setErrorMessage = vi.fn()
    createObjectURLSpy = vi
      .spyOn(globalThis.URL, 'createObjectURL')
      .mockImplementation((blob) => `blob://preview-${(blob as File).name}`)
    revokeObjectURLSpy = vi.spyOn(globalThis.URL, 'revokeObjectURL').mockImplementation(() => {})
  })

  afterEach(() => {
    createObjectURLSpy.mockRestore()
    revokeObjectURLSpy.mockRestore()
  })

  function runIntent({
    upload,
    files,
    images = [],
  }: {
    upload: UploadFn & Mock
    files: File[]
    images?: GalleryImage[]
  }) {
    return galleryUploadIntent({
      upload,
      files,
      images,
      previews: createPreviewLeasePool(),
      setImages,
      setPreviewImages,
      setErrorMessage,
    })
  }

  it('publishes previews to the overlay first, then merges results by fileName into the node write', async () => {
    const upload = vi.fn().mockResolvedValue([
      { url: 'https://example.com/a.jpg', fileName: 'a.jpg' },
      { url: 'https://example.com/b.jpg', fileName: 'b.jpg' },
    ])
    const files = [new File(['a'], 'a.jpg', { type: 'image/jpeg' }), new File(['b'], 'b.jpg', { type: 'image/jpeg' })]

    await runIntent({ upload, files })

    const previewBatch = setPreviewImages.mock.calls[0][0] as GalleryImage[]
    expect(previewBatch).toHaveLength(2)
    expect(previewBatch.every((image) => typeof image.previewSrc === 'string')).toBe(true)
    expect(setImages).not.toHaveBeenCalledWith(previewBatch)

    const merged = setImages.mock.calls.at(-1)?.[0] as GalleryImage[]
    expect(merged.map((image) => image.src)).toEqual(['https://example.com/a.jpg', 'https://example.com/b.jpg'])
    expect(merged.every((image) => image.previewSrc === undefined)).toBe(true)
  })

  it('caps additions at the 9-image limit and reports the cap', async () => {
    const upload = vi.fn().mockResolvedValue([])
    const images: GalleryImage[] = Array.from({ length: 8 }, (_, index) => ({
      src: `https://example.com/${index}.jpg`,
    }))
    const files = [
      new File(['a'], 'a.jpg', { type: 'image/jpeg' }),
      new File(['b'], 'b.jpg', { type: 'image/jpeg' }),
      new File(['c'], 'c.jpg', { type: 'image/jpeg' }),
    ]

    await runIntent({ upload, files, images })

    expect(setErrorMessage).toHaveBeenCalledExactlyOnceWith('Galleries are limited to 9 images')

    const previewBatch = setPreviewImages.mock.calls[0][0] as GalleryImage[]
    expect(previewBatch).toHaveLength(9)
  })

  it('rejects every file when the gallery already exceeds the 9-image limit', async () => {
    const upload = vi.fn().mockResolvedValue([])
    const images: GalleryImage[] = Array.from({ length: 10 }, (_, index) => ({
      src: `https://example.com/${index}.jpg`,
    }))
    const files = [new File(['a'], 'a.jpg', { type: 'image/jpeg' }), new File(['b'], 'b.jpg', { type: 'image/jpeg' })]

    await runIntent({ upload, files, images })

    expect(setErrorMessage).toHaveBeenCalledExactlyOnceWith('Galleries are limited to 9 images')
    expect(upload).not.toHaveBeenCalled()
    expect(setPreviewImages).not.toHaveBeenCalled()
    expect(setImages).not.toHaveBeenCalled()
  })

  it('cleans up previews and reports the failure when the upload resolves undefined', async () => {
    const upload = vi.fn().mockResolvedValue(undefined)
    const files = [new File(['a'], 'a.jpg', { type: 'image/jpeg' })]

    await runIntent({ upload, files })

    expect(setErrorMessage).toHaveBeenCalledExactlyOnceWith(
      'Something went wrong while uploading images. Please refresh the page and try again',
    )

    const cleaned = setImages.mock.calls.at(-1)?.[0] as GalleryImage[]
    expect(cleaned).toHaveLength(1)
    expect(cleaned[0].previewSrc).toBeUndefined()
    expect(cleaned[0].src).toBeUndefined()
  })

  it('keeps unmatched results as previews (partial result merge)', async () => {
    const upload = vi.fn().mockResolvedValue([{ url: 'https://example.com/a.jpg', fileName: 'a.jpg' }])
    const files = [new File(['a'], 'a.jpg', { type: 'image/jpeg' }), new File(['b'], 'b.jpg', { type: 'image/jpeg' })]

    await runIntent({ upload, files })

    const merged = setImages.mock.calls.at(-1)?.[0] as GalleryImage[]
    expect(merged[0].src).toBe('https://example.com/a.jpg')
    expect(merged[1].src).toBeUndefined()
    expect(merged[1].previewSrc).toBe('blob://preview-b.jpg')
  })

  it('keeps the file order when the parallel dimension reads settle out of order', async () => {
    getImageDimensions.mockImplementation(
      (src: string) =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ width: 100, height: 50 }), src === 'blob://preview-a.jpg' ? 20 : 0)
        }),
    )
    const upload = vi.fn().mockResolvedValue([
      { url: 'https://example.com/a.jpg', fileName: 'a.jpg' },
      { url: 'https://example.com/b.jpg', fileName: 'b.jpg' },
    ])
    const files = [new File(['a'], 'a.jpg', { type: 'image/jpeg' }), new File(['b'], 'b.jpg', { type: 'image/jpeg' })]

    await runIntent({ upload, files })

    const previewBatch = setPreviewImages.mock.calls[0][0] as GalleryImage[]
    expect(previewBatch.map((image) => image.fileName)).toEqual(['a.jpg', 'b.jpg'])
  })

  it('releases the batch leases and propagates when a dimension read rejects', async () => {
    getImageDimensions.mockImplementation(async (src: string) => {
      if (src === 'blob://preview-b.jpg') {
        throw new Error('cannot decode')
      }
      return { width: 100, height: 50 }
    })
    const upload = vi.fn().mockResolvedValue([])
    const files = [new File(['a'], 'a.jpg', { type: 'image/jpeg' }), new File(['b'], 'b.jpg', { type: 'image/jpeg' })]

    await expect(runIntent({ upload, files })).rejects.toThrow('cannot decode')

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob://preview-a.jpg')
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob://preview-b.jpg')
    expect(setPreviewImages).not.toHaveBeenCalled()
    expect(setImages).not.toHaveBeenCalled()
    expect(upload).not.toHaveBeenCalled()
  })
})
