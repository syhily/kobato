import type { NodeKey } from 'lexical'
import type { ComponentType } from 'react'

import type {
  CardSpecFieldMapFor,
  DecoratorNodeProperty,
  NestedEditorSpec,
  TransientPropSpec,
} from '@/inkling/nodes/base/card-specs'
import type { CardImportSpec } from '@/inkling/nodes/base/import-spec'

import { transientInitialFileProp, transientTriggerFileDialogProp } from '@/inkling/nodes/base/card-specs'
import {
  generateDecoratorNode,
  redactDataUrlValue,
  type DecoratorNodeData,
  type DecoratorNodeValueMap,
  type SerializedGeneratedDecoratorNode,
} from '@/inkling/nodes/base/generate-decorator-node'
import { captionEditorSpecBase } from '@/inkling/nodes/base/nodes/caption-editor-spec'
import { renderImageNode } from '@/inkling/nodes/base/nodes/image/image-renderer'
import { readImageAttributesFromElement } from '@/inkling/nodes/base/utils/read-image-attributes-from-element'
import { strOr } from '@/inkling/utils/value-guards'

// the selector overlay arrives through the construction dataset as a
// component value — `typeof === 'function'` is the entire runtime check;
// the component signature is the producer's contract (InklingSelectorPlugin)
const isSelectorComponent = (value: unknown): value is ComponentType<{ nodeKey: NodeKey }> =>
  typeof value === 'function'

// The card's spec arrays (CONTEXT.md: "card spec") live here, beside the
// class they type — the declaration imports them from this module. `as const`
// keeps the literal `name`s and value types on the arrays' types so the `__*`
// field maps derive both (CardSpecFieldMap / CardSpecFieldMapFor).
export const imageNestedEditors = [
  { ...captionEditorSpecBase, cleanBasicHtml: { firstChildInnerContent: true } },
] as const satisfies readonly NestedEditorSpec[]

export const imageTransientProps = [
  {
    name: 'previewSrc',
    // the `string | null` annotation is the type source for the `__previewSrc`
    // field (CardSpecFieldMap) — `strOr` itself returns string, but the field
    // must stay nullable because the upload lifecycle clears it by writing
    // `node.previewSrc = null` (src/nodes/upload-intent.ts)
    initial: (dataset): string | null => strOr(dataset.previewSrc, ''),
    datasetKey: '__previewSrc',
    accessor: true,
  },
  { ...transientTriggerFileDialogProp, datasetKey: '__triggerFileDialog' },
  // passed via INSERT_MEDIA_COMMAND on drag+drop or paste
  transientInitialFileProp,
  // selector overlay component (e.g. the GIF picker) and the flag that hides
  // the image while it is open — client-side only, never serialized
  {
    name: 'selector',
    initial: (dataset): ComponentType<{ nodeKey: NodeKey }> | undefined => {
      const { selector } = dataset
      return isSelectorComponent(selector) ? selector : undefined
    },
  },
  {
    name: 'isImageHidden',
    initial: (dataset): boolean | undefined =>
      typeof dataset.isImageHidden === 'boolean' ? dataset.isImageHidden : undefined,
  },
] as const satisfies readonly TransientPropSpec[]

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

// the merged interface self-types the spec-driven fields/accessors — see the
// BaseAudioNode note
// oxlint-disable-next-line typescript/no-empty-object-type -- class+interface merging: self-types the spec-driven fields
export interface BaseImageNode extends CardSpecFieldMapFor<typeof imageTransientProps, typeof imageNestedEditors> {}
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
}

export const $createBaseImageNode = (dataset?: ImageData) => {
  return new BaseImageNode(dataset)
}

export function $isImageNode(node: unknown): node is BaseImageNode {
  return node instanceof BaseImageNode
}
