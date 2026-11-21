import type {
  CardSpecFieldMapFor,
  DecoratorNodeProperty,
  NestedEditorSpec,
  TransientPropSpec,
} from '@kobato/inkling-internal/nodes/base/card-specs'
import type { CardImportSpec } from '@kobato/inkling-internal/nodes/base/import-spec'

import {
  transientInitialFileProp,
  transientTriggerFileDialogProp,
} from '@kobato/inkling-internal/nodes/base/card-specs'
import {
  generateDecoratorNode,
  type DecoratorNodeData,
  type DecoratorNodeValueMap,
  type SerializedGeneratedDecoratorNode,
} from '@kobato/inkling-internal/nodes/base/generate-decorator-node'
import { captionEditorSpecBase } from '@kobato/inkling-internal/nodes/base/nodes/caption-editor-spec'
import { formatVideoDuration } from '@kobato/inkling-internal/nodes/base/nodes/video/format-video-duration'
import { renderVideoNode } from '@kobato/inkling-internal/nodes/base/nodes/video/video-renderer'

export const videoNestedEditors = [
  { ...captionEditorSpecBase, nullable: true },
] as const satisfies readonly NestedEditorSpec[]

export const videoTransientProps = [
  transientTriggerFileDialogProp,
  transientInitialFileProp,
] as const satisfies readonly TransientPropSpec[]

const videoProperties = [
  { name: 'src', default: '', urlType: 'url', redactDataUrl: true },
  { name: 'caption', default: '', urlType: 'html', wordCount: true },
  { name: 'fileName', default: '' },
  { name: 'mimeType', default: '' },
  { name: 'width', default: null as number | null },
  { name: 'height', default: null as number | null },
  { name: 'duration', default: 0 },
  { name: 'thumbnailSrc', default: '', urlType: 'url' },
  { name: 'customThumbnailSrc', default: '', urlType: 'url' },
  { name: 'thumbnailWidth', default: null as number | null },
  { name: 'thumbnailHeight', default: null as number | null },
  { name: 'cardWidth', default: 'regular' },
  { name: 'loop', default: false },
] as const satisfies readonly DecoratorNodeProperty[]

export const videoImportSpec = {
  conversions: [
    {
      tag: 'figure',
      priority: 1,
      guardClass: 'inkling-video-card',
      reads: [
        {
          name: 'src',
          kind: 'property',
          property: 'src',
          selector: '.inkling-video-container video',
          required: true,
        },
        { name: 'loop', kind: 'property', property: 'loop', selector: '.inkling-video-container video' },
        {
          name: 'cardWidth',
          kind: 'classMap',
          classMap: [
            { pattern: /(?:^|\s)inkling-width-(full)(?=\s|$)/ },
            { pattern: /(?:^|\s)inkling-width-(wide)(?=\s|$)/ },
          ],
          fallback: 'regular',
        },
        {
          name: 'duration',
          kind: 'html',
          selector: '.inkling-video-duration',
          trim: true,
          omit: 'falsy',
          parse: (raw) => {
            const [rawMinutes, rawSeconds = '0'] = raw.split(':')
            const minutes = Number.parseInt(rawMinutes.trim(), 10)
            const seconds = Number.parseInt(rawSeconds.trim(), 10)
            return Number.isFinite(minutes) && Number.isFinite(seconds) ? minutes * 60 + seconds : undefined
          },
        },
        { name: 'thumbnailSrc', kind: 'attribute', attribute: 'data-inkling-thumbnail', omit: 'falsy' },
        { name: 'customThumbnailSrc', kind: 'attribute', attribute: 'data-inkling-custom-thumbnail', omit: 'falsy' },
        { name: 'caption', kind: 'caption', omit: 'falsy' },
        {
          name: 'width',
          kind: 'property',
          property: 'width',
          selector: '.inkling-video-container video',
          omit: 'falsy',
        },
        {
          name: 'height',
          kind: 'property',
          property: 'height',
          selector: '.inkling-video-container video',
          omit: 'falsy',
        },
      ],
    },
  ],
} satisfies CardImportSpec

export type VideoData = DecoratorNodeData<typeof videoProperties>

export type SerializedVideoNode = SerializedGeneratedDecoratorNode<DecoratorNodeValueMap<typeof videoProperties>>

// oxlint-disable-next-line typescript/no-empty-object-type -- class+interface merging: self-types the spec-driven fields
export interface BaseVideoNode extends CardSpecFieldMapFor<typeof videoTransientProps, typeof videoNestedEditors> {}
export class BaseVideoNode extends generateDecoratorNode({
  nodeType: 'video',
  properties: videoProperties,
  defaultRenderFn: renderVideoNode,
  importSpec: videoImportSpec,
}) {
  get formattedDuration() {
    return formatVideoDuration(this.duration)
  }
}

export const $createBaseVideoNode = (dataset?: VideoData) => {
  return new BaseVideoNode(dataset)
}

export function $isVideoNode(node: unknown): node is BaseVideoNode {
  return node instanceof BaseVideoNode
}
