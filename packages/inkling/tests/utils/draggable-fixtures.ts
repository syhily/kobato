import type { CardDraggableInfo, ImageDraggableInfo } from '@kobato/inkling-internal/utils/draggable/DragDropContainer'

export function cardDrag(overrides: Partial<CardDraggableInfo> = {}): CardDraggableInfo {
  return {
    type: 'card',
    cardName: 'paragraph',
    nodeKey: 'card-key',
    element: document.createElement('div'),
    target: null,
    mousePosition: { x: 0, y: 0 },
    dataset: {},
    ...overrides,
  }
}

export function imageDrag(overrides: Partial<ImageDraggableInfo> = {}): ImageDraggableInfo {
  return {
    type: 'image',
    element: document.createElement('div'),
    target: null,
    mousePosition: { x: 0, y: 0 },
    dataset: {},
    ...overrides,
  }
}
