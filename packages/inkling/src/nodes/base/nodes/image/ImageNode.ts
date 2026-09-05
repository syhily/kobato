import type { DecoratorNodeProperty } from '@/nodes/base/card-specs'
import type { CardImportSpec } from '@/nodes/base/import-spec'

import {
  generateDecoratorNode,
  redactDataUrlValue,
  type DecoratorNodeData,
  type DecoratorNodeValueMap,
  type SerializedGeneratedDecoratorNode,
} from '@/nodes/base/generate-decorator-node'
import { renderImageNode } from '@/nodes/base/nodes/image/image-renderer'
import { readImageAttributesFromElement } from '@/nodes/base/utils/read-image-attributes-from-element'

const imageProperties = [
  { name: 'src', default: '', urlType: 'url' },
  { name: 'caption', default: '', urlType: 'html', wordCount: true },
  { name: 'title', default: '' },
  { name: 'alt', default: '' },
  { name: 'cardWidth', default: 'regular' },
  { name: 'width', default: null as number | null },
  { name: 'height', default: null as number | null },
  { name: 'href', default: '', urlType: 'url' },
] as const satisfies readonly DecoratorNodeProperty[]

export const imageImportSpec = {
  conversions: [
    {
      tag: 'img',
      priority: 1,
      reads: [
        {
          name: 'imageAttributes',
          kind: 'composite',
          read: readImageAttributesFromElement,
          provides: ['src', 'width', 'height', 'alt', 'title', 'href'],
        },
      ],
    },
    {
      tag: 'figure',
      // generically parses figure elements, so it must run after others (like the gallery)
      priority: 0,
      guardSelector: 'img',
      reads: [
        {
          name: 'imageAttributes',
          kind: 'composite',
          selector: 'img',
          read: readImageAttributesFromElement,
          provides: ['src', 'width', 'height', 'alt', 'title', 'href'],
        },
        {
          name: 'cardWidth',
          kind: 'classMap',
          classMap: [
            { pattern: /inkling-width-(wide|full)/ },
            { pattern: /graf--layout(FillWidth|OutsetCenter)/, map: { FillWidth: 'full', OutsetCenter: 'wide' } },
          ],
        },
        { name: 'caption', kind: 'caption', fallback: '' },
      ],
    },
  ],
} satisfies CardImportSpec

export type ImageData = DecoratorNodeData<typeof imageProperties>

export type SerializedImageNode = SerializedGeneratedDecoratorNode<DecoratorNodeValueMap<typeof imageProperties>>

export interface BaseImageNode extends DecoratorNodeValueMap<typeof imageProperties> {}

export class BaseImageNode extends generateDecoratorNode({
  nodeType: 'image',
  properties: imageProperties,
  defaultRenderFn: renderImageNode,
  importSpec: imageImportSpec,
  hasEditMode: false,
}) {
  /* @override */
  exportJSON() {
    // Hand-written rather than derived from the generated exportJSON: the
    // persisted key order below (width/height before title/alt/caption) is
    // historical and differs from `imageProperties` order, and payloads must
    // stay byte-identical. The blob guard shares the one helper (an
    // upload-in-progress data-string src must not be persisted).
    const { src, width, height, title, alt, caption, cardWidth, href } = this

    // serializeNestedEditorHtml re-serializes the caption editor for wrapper
    // subclasses that adopt a `nestedEditors` spec; a no-op on the base class
    return this.serializeNestedEditorHtml({
      type: 'image',
      version: 1,
      src: redactDataUrlValue(src),
      width,
      height,
      title,
      alt,
      caption,
      cardWidth,
      href,
    })
  }

  // The transient-prop spec (image.declaration.ts) initializes these only on
  // spec-adopting assembled classes — including the accessors, which assembly
  // defines from the spec's `accessor: true` entries; a raw `new
  // BaseImageNode()` leaves the fields unset, so `undefined` is part of the
  // honest type for spec-less base instances. The `declare` legs are
  // type-only (the runtime pair is assembly-defined): they exist so
  // base-typed write-seam consumers can name the accessor.
  declare __previewSrc: string | null | undefined
  declare previewSrc: string | null | undefined
  // see `__previewSrc` — same spec-adoption lifecycle
  declare __triggerFileDialog: boolean | undefined
  declare triggerFileDialog: boolean | undefined
}

export const $createBaseImageNode = (dataset?: ImageData) => {
  return new BaseImageNode(dataset)
}

export function $isImageNode(node: unknown): node is BaseImageNode {
  return node instanceof BaseImageNode
}
