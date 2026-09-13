import type {
  CardSpecFieldMapFor,
  DecoratorNodeProperty,
  NestedEditorSpec,
  TransientPropSpec,
} from '@/inkling/nodes/base/card-specs'
import type { GalleryImage } from '@/inkling/types/gallery'

import { transientTriggerFileDialogProp } from '@/inkling/nodes/base/card-specs'
import {
  generateDecoratorNode,
  type DecoratorNodeData,
  type DecoratorNodeValueMap,
  type SerializedGeneratedDecoratorNode,
} from '@/inkling/nodes/base/generate-decorator-node'
import { captionEditorSpecBase } from '@/inkling/nodes/base/nodes/caption-editor-spec'
import { parseGalleryNode } from '@/inkling/nodes/base/nodes/gallery/gallery-parser'
import { renderGalleryNode } from '@/inkling/nodes/base/nodes/gallery/gallery-renderer'
import { MAX_IMAGES, MAX_PER_ROW } from '@/inkling/nodes/base/nodes/gallery/gallery-rows'
import { pick } from '@/inkling/utils/objects'

// the card's spec arrays live here, beside the class they type — see the
// videoNestedEditors note; the nested editor is `nullable` because the
// markdown round-trip detaches it
export const galleryNestedEditors = [
  { ...captionEditorSpecBase, nullable: true },
] as const satisfies readonly NestedEditorSpec[]

// the insert-time "open the file picker" flag — same shared spec entry the
// four upload cards carry, so the menu entry's insertParams lands on the node
export const galleryTransientProps = [transientTriggerFileDialogProp] as const satisfies readonly TransientPropSpec[]

const galleryProperties = [
  {
    name: 'images',
    // getter default: every construction/property-default read gets a fresh
    // array, so default nodes never share one instance
    get default(): GalleryImage[] {
      return []
    },
  },
  { name: 'caption', default: '', wordCount: true },
] as const satisfies readonly DecoratorNodeProperty[]

export type GalleryData = DecoratorNodeData<typeof galleryProperties>

export type SerializedGalleryNode = SerializedGeneratedDecoratorNode<DecoratorNodeValueMap<typeof galleryProperties>>

// canonical homes are gallery-rows.ts (the row-layout module); re-exported
// here so the node shim, parser, and `@/inkling/nodes/base` importers keep working
export { MAX_IMAGES, MAX_PER_ROW }

// ensure we don't save client-side only properties such as preview blob urls to the server
export const ALLOWED_IMAGE_PROPS = [
  'row',
  'src',
  'width',
  'height',
  'alt',
  'caption',
  'fileName',
] as const satisfies readonly (keyof GalleryImage)[]

export function recalculateImageRows(images: GalleryImage[]) {
  images.forEach((image: GalleryImage, idx: number) => {
    image.row = Math.ceil((idx + 1) / MAX_PER_ROW) - 1
  })
}

// the merged interface self-types the spec-driven fields/accessors — see the
// BaseAudioNode note
export interface BaseGalleryNode
  // oxlint-disable-next-line typescript/no-empty-object-type -- class+interface merging: self-types the spec-driven fields
  extends CardSpecFieldMapFor<typeof galleryTransientProps, typeof galleryNestedEditors> {}
export class BaseGalleryNode extends generateDecoratorNode({
  nodeType: 'gallery',
  properties: galleryProperties,
  defaultRenderFn: renderGalleryNode,
  hasEditMode: false,
}) {
  /* override */
  static get urlTransformMap() {
    return {
      caption: 'html',
      images: {
        src: 'url',
        caption: 'html',
      },
    }
  }

  static importDOM() {
    return parseGalleryNode(this)
  }

  // Image-list mutation helpers the card spec doesn't cover live on the base
  // node (plan 039, Batch 5): the registered card class is assembled from the
  // declaration and inherits them; renderer surfaces never invoke them.
  // TODO: move to inkling-default-nodes? — packaging decision about where
  // `setImages` lives (its view→node writes are mirrored through
  // src/hooks/gallery-images-mirror.ts).
  setImages(images: GalleryImage[]) {
    const datasetImages = images.slice(0, MAX_IMAGES).map((image) => pick(image, ALLOWED_IMAGE_PROPS))

    recalculateImageRows(datasetImages)
    this.images = datasetImages
  }

  addImages(images: GalleryImage[]) {
    const datasetImages = [...this.images, ...images]
      .slice(0, MAX_IMAGES)
      .map((image) => pick(image, ALLOWED_IMAGE_PROPS))

    recalculateImageRows(datasetImages)
    this.images = datasetImages
  }
}

export const $createBaseGalleryNode = (dataset?: GalleryData) => {
  return new BaseGalleryNode(dataset)
}

export function $isGalleryNode(node: unknown): node is BaseGalleryNode {
  return node instanceof BaseGalleryNode
}
