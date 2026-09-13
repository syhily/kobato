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
  type DecoratorNodeData,
  type DecoratorNodeValueMap,
  type SerializedGeneratedDecoratorNode,
} from '@/inkling/nodes/base/generate-decorator-node'
import { captionEditorSpecBase } from '@/inkling/nodes/base/nodes/caption-editor-spec'
import { formatVideoDuration } from '@/inkling/nodes/base/nodes/video/format-video-duration'
import { renderVideoNode } from '@/inkling/nodes/base/nodes/video/video-renderer'

// The card's spec arrays (CONTEXT.md: "card spec") live here, beside the
// class they type — the declaration imports them from this module. `as const`
// keeps the literal `name`s and value types on the arrays' types so the `__*`
// field maps derive both (CardSpecFieldMap / CardSpecFieldMapFor). The nested
// editor is `nullable`: the markdown round-trip detaches it.
export const videoNestedEditors = [
  { ...captionEditorSpecBase, nullable: true },
] as const satisfies readonly NestedEditorSpec[]

export const videoTransientProps = [
  transientTriggerFileDialogProp,
  transientInitialFileProp,
] as const satisfies readonly TransientPropSpec[]

const videoProperties = [
  // the blob guard as spec data: an upload-in-progress data-string src must
  // not be persisted (the generated exportJSON redacts it)
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
        // property reads, not attributes — `.src` absolutizes; required:
        // a card figure with no playable video aborts the conversion
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
          // token-anchored to reproduce the old classList.contains semantics
          // exactly (a `\b` pattern would also match `foo-inkling-width-full`)
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
          // video's m:ss parse — deliberately not unified with audio's
          // Number/isInteger variant
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
        // truthy-guarded so a 0 width/height is excluded
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

// the merged interface self-types the spec-driven fields/accessors — see the
// BaseAudioNode note
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
