/**
 * Compile-time pins for the closed drag-payload union.
 *
 * The producers are exactly two (the card drag in DragDropReorderPlugin and
 * the gallery image drag in useGalleryReorder), so `DraggableInfo` is closed:
 * card payloads carry the heterogeneous card dataset plus the source node key,
 * image payloads carry the precise image construction dataset.
 *
 * Type-checked only, never executed.
 */
import type { Equal, Expect } from '#/inkling/utils/type-pins'
import type { ImageNodeDataset } from '@/inkling/nodes/ImageNode'
import type { CardDraggableInfo, DraggableInfo, ImageDraggableInfo } from '@/inkling/utils/draggable/DragDropContainer'

// The union's two branches carry their own dataset

type CardBranch = Extract<DraggableInfo, { type: 'card' }>
type ImageBranch = Extract<DraggableInfo, { type: 'image' }>

type _CardBranchIsCardInfo = Expect<Equal<CardBranch, CardDraggableInfo>>
type _ImageBranchIsImageInfo = Expect<Equal<ImageBranch, ImageDraggableInfo>>
// an image drag carries the precise construction dataset — no assertion needed
type _ImageDatasetIsPrecise = Expect<Equal<ImageBranch['dataset'], ImageNodeDataset>>
// a card drag's dataset stays heterogeneous (gallery images, live editors …)
type _CardDatasetStaysOpen = Expect<Equal<CardBranch['dataset'], Record<string, unknown>>>
type _CardKeyIsRequired = Expect<Equal<CardBranch['nodeKey'], string>>
type _ImageHasNoSourceKey = Expect<Equal<Extract<keyof ImageBranch, 'nodeKey'>, never>>
// the card-only preview affordances do not leak onto the image payload
type _ImageHasNoCardName = Expect<Equal<Extract<keyof ImageBranch, 'cardName' | 'Icon'>, never>>

// Narrowing in value position, without a cast

declare const info: DraggableInfo
const imageDatasetFor = (value: DraggableInfo): ImageNodeDataset | null =>
  value.type === 'image' ? value.dataset : null
void imageDatasetFor
void info

// Construction: the built-in payloads, and the rejected shapes

const imagePayload: DraggableInfo = {
  type: 'image',
  element: null,
  target: null,
  mousePosition: { x: 0, y: 0 },
  dataset: { src: '/a.png', width: 320, height: 180 },
}
void imagePayload

const cardPayload: DraggableInfo = {
  type: 'card',
  cardName: 'gallery',
  nodeKey: 'drag-key',
  element: null,
  target: null,
  mousePosition: { x: 0, y: 0 },
  dataset: { images: [] },
}
void cardPayload

// @ts-expect-error - a card drag carries the source node key
const cardWithoutKey: DraggableInfo = {
  type: 'card',
  cardName: 'image',
  element: null,
  target: null,
  mousePosition: { x: 0, y: 0 },
  dataset: {},
}
void cardWithoutKey

const foreignType: DraggableInfo = {
  // @ts-expect-error - built-in drags are card or image only; the discriminant is closed
  type: 'file',
  element: null,
  target: null,
  mousePosition: { x: 0, y: 0 },
  dataset: {},
}
void foreignType

// An image drag cannot smuggle card-only fields
//
// Excess-property checking on a fresh literal is the only place structural
// assignability refuses them: a widened variable would strip the extra keys,
// and a union target treats a property as "known somewhere". So probe the
// image branch directly.

const imageWithCardName: ImageDraggableInfo = {
  type: 'image',
  element: null,
  target: null,
  mousePosition: { x: 0, y: 0 },
  dataset: {},
  // @ts-expect-error - the image payload carries no card identity
  cardName: 'image',
}
void imageWithCardName

const imageWithNodeKey: ImageDraggableInfo = {
  // @ts-expect-error - the image payload carries no source node key
  nodeKey: 'image-key',
  type: 'image',
  element: null,
  target: null,
  mousePosition: { x: 0, y: 0 },
  dataset: {},
}
void imageWithNodeKey

const imageWithIcon: ImageDraggableInfo = {
  // @ts-expect-error - the drag-preview icon is card-only
  Icon: () => null,
  type: 'image',
  element: null,
  target: null,
  mousePosition: { x: 0, y: 0 },
  dataset: {},
}
void imageWithIcon
