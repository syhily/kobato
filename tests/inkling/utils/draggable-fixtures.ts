/**
 * Typed drag-payload factories shared by the drag/drop specs. `DraggableInfo`
 * is a closed union (`CardDraggableInfo | ImageDraggableInfo`), so fixtures
 * are built through the real branch shape instead of casting a partial object
 * into the union. Specialized variants (an image CARD payload, a specific
 * dataset) stay local to their spec and override these defaults.
 */
import type { CardDraggableInfo, ImageDraggableInfo } from '@/inkling/utils/draggable/DragDropContainer'

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
