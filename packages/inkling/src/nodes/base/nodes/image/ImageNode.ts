import type {
  CardSpecFieldMapFor,
  DecoratorNodeProperty,
  NestedEditorSpec,
  TransientPropSpec,
} from '@kobato/inkling-internal/nodes/base/card-specs'
import type { CardImportSpec } from '@kobato/inkling-internal/nodes/base/import-spec'
import type { NodeKey } from 'lexical'
import type { ComponentType } from 'react'

import {
  transientInitialFileProp,
  transientTriggerFileDialogProp,
} from '@kobato/inkling-internal/nodes/base/card-specs'
import {
  generateDecoratorNode,
  redactDataUrlValue,
  type DecoratorNodeData,
  type DecoratorNodeValueMap,
  type SerializedGeneratedDecoratorNode,
} from '@kobato/inkling-internal/nodes/base/generate-decorator-node'
import { captionEditorSpecBase } from '@kobato/inkling-internal/nodes/base/nodes/caption-editor-spec'
import { renderImageNode } from '@kobato/inkling-internal/nodes/base/nodes/image/image-renderer'
import { readImageAttributesFromElement } from '@kobato/inkling-internal/nodes/base/utils/read-image-attributes-from-element'
import { strOr } from '@kobato/inkling-internal/utils/value-guards'

const isSelectorComponent = (value: unknown): value is ComponentType<{ nodeKey: NodeKey }> =>
  typeof value === 'function'

export const imageNestedEditors = [
  { ...captionEditorSpecBase, cleanBasicHtml: { firstChildInnerContent: true } },
] as const satisfies readonly NestedEditorSpec[]

export const imageTransientProps = [
  {
    name: 'previewSrc',
    initial: (dataset): string | null => strOr(dataset.previewSrc, ''),
    datasetKey: '__previewSrc',
    accessor: true,
  },
  { ...transientTriggerFileDialogProp, datasetKey: '__triggerFileDialog' },
  transientInitialFileProp,
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

// oxlint-disable-next-line typescript/no-empty-object-type -- class+interface merging: self-types the spec-driven fields
export interface BaseImageNode extends CardSpecFieldMapFor<typeof imageTransientProps, typeof imageNestedEditors> {}
export class BaseImageNode extends generateDecoratorNode({
  nodeType: 'image',
  properties: imageProperties,
  defaultRenderFn: renderImageNode,
  importSpec: imageImportSpec,
  hasEditMode: false,
}) {
  exportJSON() {
    const { src, width, height, title, alt, caption, cardWidth, href } = this

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
