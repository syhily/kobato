import type { ImageNodeDataset } from '@kobato/inkling-internal/nodes/ImageNode'
import type {
  CardDraggableInfo,
  DraggableInfo,
  ImageDraggableInfo,
} from '@kobato/inkling-internal/utils/draggable/DragDropContainer'
import type { Equal, Expect } from '@kobato/inkling/tests/utils/type-pins'

type CardBranch = Extract<DraggableInfo, { type: 'card' }>
type ImageBranch = Extract<DraggableInfo, { type: 'image' }>

type _CardBranchIsCardInfo = Expect<Equal<CardBranch, CardDraggableInfo>>
type _ImageBranchIsImageInfo = Expect<Equal<ImageBranch, ImageDraggableInfo>>
type _ImageDatasetIsPrecise = Expect<Equal<ImageBranch['dataset'], ImageNodeDataset>>
type _CardDatasetStaysOpen = Expect<Equal<CardBranch['dataset'], Record<string, unknown>>>
type _CardKeyIsRequired = Expect<Equal<CardBranch['nodeKey'], string>>
type _ImageHasNoSourceKey = Expect<Equal<Extract<keyof ImageBranch, 'nodeKey'>, never>>
type _ImageHasNoCardName = Expect<Equal<Extract<keyof ImageBranch, 'cardName' | 'Icon'>, never>>

declare const _info: DraggableInfo
const _imageDatasetFor = (value: DraggableInfo): ImageNodeDataset | null =>
  value.type === 'image' ? value.dataset : null

const _imagePayload: DraggableInfo = {
  type: 'image',
  element: null,
  target: null,
  mousePosition: { x: 0, y: 0 },
  dataset: { src: '/a.png', width: 320, height: 180 },
}

const _cardPayload: DraggableInfo = {
  type: 'card',
  cardName: 'gallery',
  nodeKey: 'drag-key',
  element: null,
  target: null,
  mousePosition: { x: 0, y: 0 },
  dataset: { images: [] },
}

// @ts-expect-error - a card drag carries the source node key
const _cardWithoutKey: DraggableInfo = {
  type: 'card',
  cardName: 'image',
  element: null,
  target: null,
  mousePosition: { x: 0, y: 0 },
  dataset: {},
}

const _foreignType: DraggableInfo = {
  // @ts-expect-error - built-in drags are card or image only; the discriminant is closed
  type: 'file',
  element: null,
  target: null,
  mousePosition: { x: 0, y: 0 },
  dataset: {},
}

const _imageWithCardName: ImageDraggableInfo = {
  type: 'image',
  element: null,
  target: null,
  mousePosition: { x: 0, y: 0 },
  dataset: {},
  // @ts-expect-error - the image payload carries no card identity
  cardName: 'image',
}

const _imageWithNodeKey: ImageDraggableInfo = {
  // @ts-expect-error - the image payload carries no source node key
  nodeKey: 'image-key',
  type: 'image',
  element: null,
  target: null,
  mousePosition: { x: 0, y: 0 },
  dataset: {},
}

const _imageWithIcon: ImageDraggableInfo = {
  // @ts-expect-error - the drag-preview icon is card-only
  Icon: () => null,
  type: 'image',
  element: null,
  target: null,
  mousePosition: { x: 0, y: 0 },
  dataset: {},
}
