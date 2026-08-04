import { getImageColor } from '@kobato/editor/widgets/aplayer/utils/get-image-color'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('editor/widgets/aplayer/utils/get-image-color', () => {
  let imageInstances: Array<MockImage> = []

  class MockImage {
    public src = ''
    public crossOrigin = ''
    public naturalWidth = 2
    public naturalHeight = 2
    public onload: (() => void) | null = null
    public onerror: (() => void) | null = null

    constructor() {
      imageInstances.push(this)
    }
  }

  function createMockContext(pixels: Uint8ClampedArray, shouldThrow = false) {
    return {
      drawImage: vi.fn(),
      getImageData: shouldThrow
        ? vi.fn(() => {
            throw new Error('tainted canvas')
          })
        : vi.fn(() => ({ data: pixels })),
    }
  }

  function createMockCanvas(ctx: ReturnType<typeof createMockContext>) {
    return {
      getContext: vi.fn(() => ctx),
      width: 0,
      height: 0,
    }
  }

  beforeEach(() => {
    vi.stubGlobal('Image', MockImage)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    imageInstances = []
  })

  it('resolves the fallback when canvas context is unavailable', async () => {
    const canvas = { getContext: vi.fn(() => null) }
    vi.stubGlobal('document', {
      createElement: vi.fn(() => canvas),
    })

    const promise = getImageColor('https://example.com/cover.png')
    imageInstances[0]!.onload?.()
    await expect(promise).resolves.toBe('#007a82')
  })

  it('computes the average opaque non-white color', async () => {
    // 2x2 image: three red pixels and one transparent pixel.
    const pixels = new Uint8ClampedArray([255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 0, 0, 0, 0])
    const ctx = createMockContext(pixels)
    const canvas = createMockCanvas(ctx)
    vi.stubGlobal('document', {
      createElement: vi.fn(() => canvas),
    })

    const promise = getImageColor('https://example.com/cover.png')
    imageInstances[0]!.onload?.()
    await expect(promise).resolves.toBe('#ff0000')
  })

  it('skips near-white pixels', async () => {
    const pixels = new Uint8ClampedArray([0, 128, 0, 255, 255, 255, 255, 255])
    const ctx = createMockContext(pixels)
    const canvas = createMockCanvas(ctx)
    vi.stubGlobal('document', {
      createElement: vi.fn(() => canvas),
    })

    const promise = getImageColor('https://example.com/cover.png')
    imageInstances[0]!.onload?.()
    await expect(promise).resolves.toBe('#008000')
  })

  it('falls back when all pixels are transparent or white', async () => {
    const pixels = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 0])
    const ctx = createMockContext(pixels)
    const canvas = createMockCanvas(ctx)
    vi.stubGlobal('document', {
      createElement: vi.fn(() => canvas),
    })

    const promise = getImageColor('https://example.com/cover.png')
    imageInstances[0]!.onload?.()
    await expect(promise).resolves.toBe('#007a82')
  })

  it('falls back when getImageData throws', async () => {
    const ctx = createMockContext(new Uint8ClampedArray(0), true)
    const canvas = createMockCanvas(ctx)
    vi.stubGlobal('document', {
      createElement: vi.fn(() => canvas),
    })

    const promise = getImageColor('https://example.com/cover.png')
    imageInstances[0]!.onload?.()
    await expect(promise).resolves.toBe('#007a82')
  })

  it('falls back on image error', async () => {
    vi.stubGlobal('document', {
      createElement: vi.fn(),
    })

    const promise = getImageColor('https://example.com/broken.png')
    imageInstances[0]!.onerror?.()
    await expect(promise).resolves.toBe('#007a82')
  })

  it('sets crossOrigin to anonymous', async () => {
    vi.stubGlobal('document', {
      createElement: vi.fn(),
    })

    getImageColor('https://example.com/cover.png')
    expect(imageInstances[0]!.crossOrigin).toBe('anonymous')
  })
})
