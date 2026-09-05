import { beforeEach, describe, expect, it, vi } from 'vitest'

import { DragDropContainer, type ContainerDragHandlers, type DraggableInfo } from '@/utils/draggable/DragDropContainer'
import '@/utils/draggable/draggable-constants'

function createHandlers(): ContainerDragHandlers {
  return {
    draggable: {
      getDraggableInfo: vi.fn((element: HTMLElement | null): DraggableInfo | false => {
        if (!element) {
          return false
        }
        return {
          type: element.dataset.type || 'unknown',
          element,
          target: null,
          mousePosition: { x: 0, y: 0 },
          dataset: {},
        }
      }),
      draggableSelector: '.draggable',
    },
    droppable: {
      onDrop: vi.fn().mockReturnValue(true),
      getIndicatorPosition: vi.fn().mockReturnValue(false),
      droppableSelector: '.droppable',
      onDragEnterContainer: vi.fn(),
      onDragEnterDroppable: vi.fn(),
      onDragOverDroppable: vi.fn(),
      onDragLeaveDroppable: vi.fn(),
      onDragLeaveContainer: vi.fn(),
    },
    lifecycle: {
      onDragStart: vi.fn(),
      onDragEnd: vi.fn(),
      onDropEnd: vi.fn(),
    },
  }
}

describe('DragDropContainer', () => {
  let containerElement: HTMLElement

  beforeEach(() => {
    document.body.innerHTML = ''
    containerElement = document.createElement('div')
    containerElement.innerHTML = `
      <div class="draggable" data-type="card">Draggable</div>
      <div class="droppable">Droppable</div>
    `
    document.body.appendChild(containerElement)
  })

  it('constructs with handlers and marks container dataset', () => {
    const handlers = createHandlers()
    const container = new DragDropContainer(containerElement, handlers)

    expect(container.element).toBe(containerElement)
    expect(containerElement.dataset.inklingDndContainer).toBe('true')
    expect(container.draggables).toHaveLength(1)
    expect(container.droppables).toHaveLength(1)
  })

  it('disableDrag removes dataset and clears draggables/droppables', () => {
    const handlers = createHandlers()
    const container = new DragDropContainer(containerElement, handlers)

    container.disableDrag()

    expect(containerElement.dataset.inklingDndContainer).toBeUndefined()
    expect(container.isDragEnabled).toBe(false)
    expect(container.draggables).toHaveLength(0)
    expect(container.droppables).toHaveLength(0)
  })

  it('enableDrag restores dataset and refresh elements', () => {
    const handlers = createHandlers()
    const container = new DragDropContainer(containerElement, handlers)

    container.disableDrag()
    container.enableDrag()

    expect(containerElement.dataset.inklingDndContainer).toBe('true')
    expect(container.isDragEnabled).toBe(true)
    expect(container.draggables).toHaveLength(1)
    expect(container.droppables).toHaveLength(1)
  })

  it('refresh updates data attributes', () => {
    const handlers = createHandlers()
    const container = new DragDropContainer(containerElement, handlers)

    const draggable = containerElement.querySelector('.draggable') as HTMLElement
    expect(draggable.dataset.inklingDndDraggable).toBe('true')

    container.refresh()
    expect(draggable.dataset.inklingDndDraggable).toBe('true')
  })

  it('createDragPreviewElement returns element from custom createDragPreviewElement', () => {
    const customDragPreviewElement = document.createElement('div')
    customDragPreviewElement.id = 'custom-drag-preview'

    const handlers = createHandlers()
    handlers.draggable.createDragPreviewElement = vi.fn().mockReturnValue({ element: customDragPreviewElement })

    const container = new DragDropContainer(containerElement, handlers)
    const draggable = containerElement.querySelector('.draggable') as HTMLElement
    const info: DraggableInfo = {
      element: draggable,
      target: null,
      mousePosition: { x: 0, y: 0 },
      dataset: {},
    }

    const dragPreview = container.createDragPreviewElement(info)
    expect(dragPreview?.element).toBe(customDragPreviewElement)
  })

  it('createDragPreviewElement returns image drag preview for image type', () => {
    const handlers = createHandlers()
    const container = new DragDropContainer(containerElement, handlers)

    const draggable = containerElement.querySelector('.draggable') as HTMLElement
    const img = document.createElement('img')
    img.src = 'https://example.com/image.png'
    img.width = 400
    img.height = 200
    draggable.appendChild(img)

    const info: DraggableInfo = {
      type: 'image',
      element: draggable,
      target: null,
      mousePosition: { x: 0, y: 0 },
      dataset: {},
    }

    const dragPreview = container.createDragPreviewElement(info)
    expect(dragPreview?.element).toBeInstanceOf(HTMLImageElement)
    expect(dragPreview?.element.id).toBe('inkling-drag-drop-preview')
    expect(dragPreview?.element.style.position).toBe('absolute')
  })

  it('createDragPreviewElement returns image drag preview for image cardName', () => {
    const handlers = createHandlers()
    const container = new DragDropContainer(containerElement, handlers)

    const draggable = containerElement.querySelector('.draggable') as HTMLElement
    const img = document.createElement('img')
    img.src = 'https://example.com/image.png'
    img.width = 200
    img.height = 400
    draggable.appendChild(img)

    const info: DraggableInfo = {
      cardName: 'image',
      element: draggable,
      target: null,
      mousePosition: { x: 0, y: 0 },
      dataset: {},
    }

    const dragPreview = container.createDragPreviewElement(info)
    expect(dragPreview?.element).toBeInstanceOf(HTMLImageElement)
  })

  it('createDragPreviewElement returns undefined when no drag preview can be created', () => {
    const handlers = createHandlers()
    const container = new DragDropContainer(containerElement, handlers)

    const draggable = containerElement.querySelector('.draggable') as HTMLElement
    const info: DraggableInfo = {
      type: 'text',
      element: draggable,
      target: null,
      mousePosition: { x: 0, y: 0 },
      dataset: {},
    }

    const dragPreviewElement = container.createDragPreviewElement(info)
    expect(dragPreviewElement).toBeUndefined()
  })

  it('refresh respects isDragEnabled state', () => {
    const handlers = createHandlers()
    const container = new DragDropContainer(containerElement, handlers)

    container.disableDrag()
    containerElement.innerHTML += '<div class="draggable">New Draggable</div>'
    container.enableDrag()

    expect(container.draggables).toHaveLength(2)
    expect(container.draggables.every((el) => el.dataset.inklingDndDraggable === 'true')).toBe(true)
  })
})
