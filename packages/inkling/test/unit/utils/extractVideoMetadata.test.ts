import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import extractVideoMetadata from '@/utils/extractVideoMetadata'

class MockCanvas {
  width = 0
  height = 0

  getContext() {
    return {
      drawImage: vi.fn(),
      canvas: this,
    }
  }

  toBlob(callback: (blob: Blob) => void, _type?: string, _quality?: number) {
    callback(new Blob(['thumbnail'], { type: 'image/jpeg' }))
  }
}

class MockVideo extends EventTarget {
  muted = false
  playsInline = false
  src = ''
  duration = 10
  videoWidth = 100
  videoHeight = 50
  private _currentTime = 0

  get currentTime() {
    return this._currentTime
  }

  set currentTime(value: number) {
    this._currentTime = value
    queueMicrotask(() => this.dispatchEvent(new Event('seeked')))
  }

  load() {
    this.dispatchEvent(new Event('loadedmetadata'))
    this.dispatchEvent(new Event('canplay'))
  }
}

describe('extractVideoMetadata', () => {
  // capture the originals through Reflect.get: a plain `document.createElement`
  // reference trips unbound-method, and one of its overloads is deprecated
  const originalCreateElement = Reflect.get(document, 'createElement') as (tagName: string) => HTMLElement
  const originalCreateObjectURL = Reflect.get(URL, 'createObjectURL') as typeof URL.createObjectURL
  const originalRevokeObjectURL = Reflect.get(URL, 'revokeObjectURL') as typeof URL.revokeObjectURL

  // a local handle avoids unbound-method on URL.revokeObjectURL references
  let revokeObjectURL: ReturnType<typeof vi.fn<(url: string) => void>>

  beforeEach(() => {
    revokeObjectURL = vi.fn<(url: string) => void>()
    URL.createObjectURL = () => 'blob://video'
    URL.revokeObjectURL = revokeObjectURL

    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'video') {
        return new MockVideo() as unknown as HTMLElement
      }
      if (tagName === 'canvas') {
        return new MockCanvas() as unknown as HTMLElement
      }
      return originalCreateElement.call(document, tagName)
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    URL.createObjectURL = originalCreateObjectURL
    URL.revokeObjectURL = originalRevokeObjectURL
  })

  it('resolves with video metadata and a thumbnail blob', async () => {
    const file = new File(['video'], 'test.mp4', { type: 'video/mp4' })

    const result = await extractVideoMetadata(file)

    expect(result.duration).toBe(10)
    expect(result.width).toBe(100)
    expect(result.height).toBe(50)
    expect(result.mimeType).toBe('video/mp4')
    expect(result.thumbnailBlob).toBeInstanceOf(Blob)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob://video')
  })

  it('rejects when the video fails to load — and still releases the object URL', async () => {
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'video') {
        const video = new MockVideo()
        video.load = () => video.dispatchEvent(new Event('error'))
        return video as unknown as HTMLElement
      }
      return originalCreateElement.call(document, tagName)
    })

    const file = new File(['video'], 'test.mp4', { type: 'video/mp4' })

    await expect(extractVideoMetadata(file)).rejects.toThrow('Failed to load video metadata')
    expect(revokeObjectURL).toHaveBeenCalledWith('blob://video')
  })

  it('rejects when the video load hangs past the timeout — and still releases the object URL', async () => {
    vi.useFakeTimers()
    try {
      vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
        if (tagName === 'video') {
          const video = new MockVideo()
          video.load = () => {}
          return video as unknown as HTMLElement
        }
        return originalCreateElement.call(document, tagName)
      })

      const file = new File(['video'], 'test.mp4', { type: 'video/mp4' })

      const assertion = expect(extractVideoMetadata(file)).rejects.toThrow('timed out')
      await vi.advanceTimersByTimeAsync(15_000)
      await assertion
      expect(revokeObjectURL).toHaveBeenCalledWith('blob://video')
    } finally {
      vi.useRealTimers()
    }
  })
})
