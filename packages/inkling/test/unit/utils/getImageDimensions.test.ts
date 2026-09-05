import { afterEach, describe, expect, it } from 'vitest'

import { getImageDimensions } from '@/utils/getImageDimensions'

describe('getImageDimensions', () => {
  const OriginalImage = globalThis.Image

  afterEach(() => {
    globalThis.Image = OriginalImage
  })

  it('resolves with natural dimensions when the image loads', async () => {
    globalThis.Image = class MockImage extends EventTarget {
      naturalWidth = 120
      naturalHeight = 90

      set src(_url: string) {
        queueMicrotask(() => this.dispatchEvent(new Event('load')))
      }
    } as unknown as typeof Image

    await expect(getImageDimensions('https://example.com/image.png')).resolves.toEqual({
      width: 120,
      height: 90,
    })
  })

  it('rejects when the image fails to load', async () => {
    globalThis.Image = class MockImage extends EventTarget {
      set src(_url: string) {
        queueMicrotask(() => this.dispatchEvent(new Event('error')))
      }
    } as unknown as typeof Image

    await expect(getImageDimensions('https://example.com/broken.png')).rejects.toThrow('Failed to load image')
  })
})
