import { act, renderHook } from '@testing-library/react'
import React from 'react'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { DraggableInfo } from '@/utils/draggable/DragDropContainer'

import { DragDropHandleContext } from '@/context/DragDropHandleContext'
import useGalleryReorder, { type GalleryImage } from '@/hooks/useGalleryReorder'
import { createDragDropHandle } from '@/plugins/behaviour/dragDropHandle'
import { DragDropHandler } from '@/utils/draggable/DragDropHandler'

const mockContainer = {
  enableDrag: vi.fn(),
  disableDrag: vi.fn(),
  refresh: vi.fn(),
  destroy: vi.fn(),
}

const dragDropHandler = new DragDropHandler()
const registerContainer = vi.spyOn(dragDropHandler, 'registerContainer').mockReturnValue(mockContainer)

// a real handle instance carrying the mock DragDropHandler — the hook
// subscribes to the handle, so the handler is set before render
const dragDropHandle = createDragDropHandle()
dragDropHandle.setState({ handler: dragDropHandler })

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(DragDropHandleContext.Provider, { value: dragDropHandle }, children)

function createImageContainer(images: GalleryImage[]) {
  const container = document.createElement('div')
  images.forEach((image, index) => {
    const imgContainer = document.createElement('div')
    imgContainer.dataset.image = String(index)
    const img = document.createElement('img')
    img.src = image.src ?? ''
    imgContainer.append(img)
    container.append(imgContainer)
  })
  return container
}

async function renderGalleryHook(images: GalleryImage[]) {
  const updateImages = vi.fn()
  const { result } = renderHook(() => useGalleryReorder({ images, updateImages }), { wrapper })
  return { result, updateImages }
}

async function getRegisteredOptions(images: GalleryImage[] = []) {
  const { result, updateImages } = await renderGalleryHook(images)
  const container = createImageContainer(images)
  await act(async () => {
    result.current.setContainerRef(container)
  })
  const [, options] = registerContainer.mock.calls[0]
  const onDropEnd = options.lifecycle?.onDropEnd
  if (!onDropEnd) {
    throw new Error('gallery reorder must register an onDropEnd lifecycle handler')
  }
  return { options, onDropEnd, container, result, updateImages }
}

describe('useGalleryReorder', () => {
  afterAll(() => {
    dragDropHandler.destroy()
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('registers a drag/drop container when a gallery element is available', async () => {
    const { result, updateImages } = await renderGalleryHook([])
    const container = document.createElement('div')

    await act(async () => {
      result.current.setContainerRef(container)
    })

    expect(registerContainer).toHaveBeenCalledWith(
      container,
      expect.objectContaining({
        draggable: expect.objectContaining({
          getDraggableInfo: expect.any(Function),
        }),
        droppable: expect.objectContaining({
          onDrop: expect.any(Function),
          getIndicatorPosition: expect.any(Function),
        }),
        lifecycle: expect.objectContaining({
          onDropEnd: expect.any(Function),
        }),
      }),
    )
    expect(updateImages).not.toHaveBeenCalled()
  })

  it('adds an external image on drop', async () => {
    const { options, updateImages } = await getRegisteredOptions([])

    const draggableInfo: DraggableInfo = {
      type: 'image',
      element: null,
      target: null,
      mousePosition: { x: 0, y: 0 },
      dataset: {
        src: 'https://example.com/image.jpg',
        width: 100,
        height: 200,
      },
    }

    // empty gallery: the drop is container-level, so the resolution is null
    // and the first image lands at slot 0
    const result = options.droppable.onDrop(draggableInfo, null)

    // the gallery consumed the drop itself, so it reports the source as
    // handled — its own onDropEnd must not remove the image again
    expect(result).toEqual({ success: true, sourceHandled: true })
    expect(updateImages).toHaveBeenCalledWith([
      expect.objectContaining({
        src: 'https://example.com/image.jpg',
        width: 100,
        height: 200,
      }),
    ])
  })

  it('adds an external image on drop when the src contains selector-special characters', async () => {
    const src = 'https://example.com/weird"].jpg?sig=a"b'
    const { options, updateImages } = await getRegisteredOptions([])

    const element = document.createElement('div')
    const img = document.createElement('img')
    img.src = src
    element.append(img)

    const draggableInfo: DraggableInfo = {
      type: 'image',
      element,
      target: null,
      mousePosition: { x: 0, y: 0 },
      dataset: { src },
    }

    const result = options.droppable.onDrop(draggableInfo, null)

    expect(result).toEqual({ success: true, sourceHandled: true })
    expect(updateImages).toHaveBeenCalledWith([expect.objectContaining({ src })])
  })

  it('reorders images when dropping an internal image', async () => {
    const images: GalleryImage[] = [
      { src: 'https://example.com/one.jpg' },
      { src: 'https://example.com/two.jpg' },
      { src: 'https://example.com/three.jpg' },
    ]
    const { options, container, updateImages } = await getRegisteredOptions(images)

    const draggableElement = container.children[0]

    const draggableInfo: DraggableInfo = {
      type: 'image',
      element: draggableElement as HTMLElement,
      target: null,
      mousePosition: { x: 0, y: 0 },
      dataset: { src: 'https://example.com/one.jpg' },
    }

    const result = options.droppable.onDrop(draggableInfo, { insertIndex: 3 })

    expect(result).toEqual({ success: true, sourceHandled: true })
    expect(updateImages).toHaveBeenCalledWith([
      { src: 'https://example.com/two.jpg' },
      { src: 'https://example.com/three.jpg' },
      { src: 'https://example.com/one.jpg' },
    ])
  })

  it('rejects an internal drop when the dragged image no longer exists', async () => {
    // positional lookup (§3-25): the source is located by the dragged
    // element's slot among the container's droppables — so the "removed
    // remotely" divergence is built directly: the DOM still renders two
    // slots while the hook's images data only holds one, and slot 1
    // resolves past the end of the data
    const { result, updateImages } = await renderGalleryHook([{ src: 'https://example.com/one.jpg' }])
    const container = createImageContainer([
      { src: 'https://example.com/one.jpg' },
      { src: 'https://example.com/two.jpg' },
    ])
    await act(async () => {
      result.current.setContainerRef(container)
    })
    const [, options] = registerContainer.mock.calls[0]

    const draggableInfo: DraggableInfo = {
      type: 'image',
      element: container.children[1] as HTMLElement,
      target: null,
      mousePosition: { x: 0, y: 0 },
      dataset: { src: 'https://example.com/two.jpg' },
    }

    const success = options.droppable.onDrop(draggableInfo, { insertIndex: 0 })

    expect(success).toBe(false)
    expect(updateImages).not.toHaveBeenCalled()
  })

  it('skips onDropEnd after a successful internal reorder', async () => {
    const images: GalleryImage[] = [{ src: 'https://example.com/one.jpg' }, { src: 'https://example.com/two.jpg' }]
    const { options, onDropEnd, container, updateImages } = await getRegisteredOptions(images)

    const draggableElement = container.children[0]

    const draggableInfo: DraggableInfo = {
      type: 'image',
      element: draggableElement as HTMLElement,
      target: null,
      mousePosition: { x: 0, y: 0 },
      dataset: { src: 'https://example.com/one.jpg' },
    }

    // the handler routes the drop result back to the target container's own
    // onDropEnd — sourceHandled tells it not to remove the reordered image
    const result = options.droppable.onDrop(draggableInfo, { insertIndex: 2 })
    expect(result).toEqual({ success: true, sourceHandled: true })
    expect(updateImages).toHaveBeenCalledWith([
      { src: 'https://example.com/two.jpg' },
      { src: 'https://example.com/one.jpg' },
    ])
    onDropEnd(draggableInfo, true, true)

    expect(updateImages).toHaveBeenCalledTimes(1)
  })

  it('removes an image when it is dropped outside the gallery', async () => {
    const images: GalleryImage[] = [{ src: 'https://example.com/one.jpg' }, { src: 'https://example.com/two.jpg' }]
    const { onDropEnd, container, updateImages } = await getRegisteredOptions(images)

    const draggableInfo: DraggableInfo = {
      type: 'image',
      element: container.children[0] as HTMLElement,
      target: null,
      mousePosition: { x: 0, y: 0 },
      dataset: { src: 'https://example.com/one.jpg' },
    }

    // dropped elsewhere: this gallery's onDrop never ran, so the handler
    // reports sourceHandled=false and the source image is removed — located
    // by the dragged element's slot among the droppables
    onDropEnd(draggableInfo, true, false)

    expect(updateImages).toHaveBeenCalledWith([{ src: 'https://example.com/two.jpg' }])
  })

  it('does not allow dropping non-image draggables', async () => {
    const { options, updateImages } = await getRegisteredOptions([])

    const draggableInfo: DraggableInfo = {
      type: 'file',
      element: null,
      target: null,
      mousePosition: { x: 0, y: 0 },
      dataset: {},
    }

    const success = options.droppable.onDrop(draggableInfo, null)

    expect(success).toBe(false)
    expect(updateImages).not.toHaveBeenCalled()
  })

  it('returns draggable info for a gallery image', async () => {
    const images: GalleryImage[] = [{ src: 'https://example.com/one.jpg', fileName: 'one.jpg' }]
    const { options, container } = await getRegisteredOptions(images)

    const imgContainer = container.children[0]
    const draggableInfo = options.draggable.getDraggableInfo(imgContainer as HTMLElement)

    expect(draggableInfo).toEqual(
      expect.objectContaining({
        type: 'image',
        dataset: expect.objectContaining({ src: 'https://example.com/one.jpg', fileName: 'one.jpg' }),
      }),
    )
  })

  it('returns false from getDraggableInfo when the element is not a gallery image', async () => {
    const { options } = await getRegisteredOptions([])

    const draggableInfo = options.draggable.getDraggableInfo(null)

    expect(draggableInfo).toBe(false)
  })
})
