import type {
  CardSpecFieldMapFor,
  DecoratorNodeProperty,
  NestedEditorSpec,
  TransientPropSpec,
} from '@kobato/inkling-internal/nodes/base/card-specs'
import type { GalleryImage } from '@kobato/inkling-internal/types/gallery'

import { transientTriggerFileDialogProp } from '@kobato/inkling-internal/nodes/base/card-specs'
import {
  generateDecoratorNode,
  type DecoratorNodeData,
  type DecoratorNodeValueMap,
  type SerializedGeneratedDecoratorNode,
} from '@kobato/inkling-internal/nodes/base/generate-decorator-node'
import { captionEditorSpecBase } from '@kobato/inkling-internal/nodes/base/nodes/caption-editor-spec'
import { parseGalleryNode } from '@kobato/inkling-internal/nodes/base/nodes/gallery/gallery-parser'
import { renderGalleryNode } from '@kobato/inkling-internal/nodes/base/nodes/gallery/gallery-renderer'
import { MAX_IMAGES, MAX_PER_ROW } from '@kobato/inkling-internal/nodes/base/nodes/gallery/gallery-rows'
import { pick } from '@kobato/inkling-internal/utils/objects'

export const galleryNestedEditors = [
  { ...captionEditorSpecBase, nullable: true },
] as const satisfies readonly NestedEditorSpec[]

export const galleryTransientProps = [transientTriggerFileDialogProp] as const satisfies readonly TransientPropSpec[]

const galleryProperties = [
  {
    name: 'images',
    get default(): GalleryImage[] {
      return []
    },
  },
  { name: 'caption', default: '', wordCount: true },
] as const satisfies readonly DecoratorNodeProperty[]

export type GalleryData = DecoratorNodeData<typeof galleryProperties>

export type SerializedGalleryNode = SerializedGeneratedDecoratorNode<DecoratorNodeValueMap<typeof galleryProperties>>

export { MAX_IMAGES, MAX_PER_ROW }

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

export interface BaseGalleryNode
  // oxlint-disable-next-line typescript/no-empty-object-type
  extends CardSpecFieldMapFor<typeof galleryTransientProps, typeof galleryNestedEditors> {}
export class BaseGalleryNode extends generateDecoratorNode({
  nodeType: 'gallery',
  properties: galleryProperties,
  defaultRenderFn: renderGalleryNode,
  hasEditMode: false,
}) {
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
