import { describe, expect, it, vi } from 'vitest'

import type { GalleryImage } from '@/types/gallery'

import { createGalleryImagesMirror } from '@/hooks/gallery-images-mirror'

const image = (overrides: Partial<GalleryImage>): GalleryImage => ({ width: 100, height: 100, ...overrides })

const one = image({ src: '/one.png', fileName: 'one.png', row: 0 })
const two = image({ src: '/two.png', fileName: 'two.png', row: 0 })
const three = image({ src: '/three.png', fileName: 'three.png', row: 0 })

function setup({ initialNodeImages = [one, two] }: { initialNodeImages?: GalleryImage[] } = {}) {
  let nodeImages: GalleryImage[] | undefined = initialNodeImages
  const nodeListeners = new Set<() => void>()
  const notifyNode = () => {
    for (const listener of nodeListeners) {
      listener()
    }
  }

  // mimic the node's setImages: a fresh array holding only the persisted props
  const writeNodeImages = vi.fn((images: GalleryImage[]) => {
    nodeImages = images.map(({ previewSrc: _previewSrc, title: _title, href: _href, ...persisted }) => persisted)
    notifyNode()
  })

  const mirror = createGalleryImagesMirror({
    readNodeImages: () => nodeImages,
    writeNodeImages,
    subscribeToNodeImages: (listener) => {
      nodeListeners.add(listener)
      return () => {
        nodeListeners.delete(listener)
      }
    },
  })

  const touchNode = () => {
    notifyNode()
  }
  const externalSet = (images: GalleryImage[] | undefined) => {
    nodeImages = images
    notifyNode()
  }

  return { mirror, writeNodeImages, touchNode, externalSet }
}

describe('createGalleryImagesMirror', () => {
  it('starts from the node images', () => {
    const initial = [one, two]
    const { mirror } = setup({ initialNodeImages: initial })

    expect(mirror.getSnapshot()).toBe(initial)
  })

  it('setImages renders immediately and writes the node through the seam port', () => {
    const { mirror, writeNodeImages } = setup()
    mirror.start()

    const reordered = [two, one]
    mirror.setImages(reordered)

    expect(mirror.getSnapshot()).toBe(reordered)
    expect(writeNodeImages).toHaveBeenCalledWith(reordered)
  })

  it('setPreviewImages publishes the overlay without writing the node (preview-first)', () => {
    const { mirror, writeNodeImages } = setup()
    mirror.start()

    const withPreview = [one, two, image({ fileName: 'p.png', previewSrc: 'blob:p' })]
    mirror.setPreviewImages(withPreview)

    expect(mirror.getSnapshot()).toBe(withPreview)
    expect(writeNodeImages).not.toHaveBeenCalled()
  })

  it('resyncs when the node changes externally, discarding an in-flight overlay', () => {
    const { mirror, externalSet } = setup()
    mirror.start()

    const listener = vi.fn()
    mirror.subscribe(listener)

    mirror.setPreviewImages([one, two, image({ fileName: 'p.png', previewSrc: 'blob:p' })])
    listener.mockClear()

    // undo of a within-card delete / collab: the node wins wholesale
    externalSet([three])

    expect(mirror.getSnapshot()).toEqual([three])
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('ignores notifications that leave the node images reference unchanged', () => {
    const { mirror, touchNode } = setup()
    mirror.start()

    const listener = vi.fn()
    mirror.subscribe(listener)

    touchNode()

    expect(listener).not.toHaveBeenCalled()
    expect(mirror.getSnapshot()).toEqual([one, two])
  })

  it('treats a persisted-equal node change as the echo of its own write and keeps the overlay', () => {
    const { mirror, externalSet } = setup()
    mirror.start()

    // a reorder during an in-flight upload: the overlay carries preview props
    // the node strips on write — the echo must not drop them
    const reordered = [image({ fileName: 'p.png', previewSrc: 'blob:p', row: 0 }), image({ ...one, row: 1 })]
    mirror.setImages(reordered)

    expect(mirror.getSnapshot()).toBe(reordered)
    expect(mirror.getSnapshot()[0].previewSrc).toBe('blob:p')

    // ...and a later external change still resyncs
    externalSet([three])
    expect(mirror.getSnapshot()).toEqual([three])
  })

  it('resyncs to an empty list when the node is gone', () => {
    const { mirror, externalSet } = setup()
    mirror.start()

    externalSet(undefined)

    expect(mirror.getSnapshot()).toEqual([])
  })

  it('stops resyncing after dispose', () => {
    const { mirror, externalSet } = setup()
    mirror.start()
    mirror.dispose()

    externalSet([three])

    expect(mirror.getSnapshot()).toEqual([one, two])
  })

  it('subscribes to the node only once across repeated starts', () => {
    const { mirror, externalSet } = setup()
    mirror.start()
    mirror.start()

    const listener = vi.fn()
    mirror.subscribe(listener)

    externalSet([three])

    expect(listener).toHaveBeenCalledTimes(1)
  })
})
