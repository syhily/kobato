import type { CardSpecFieldMapFor, DecoratorNodeProperty, TransientPropSpec } from '@/inkling/nodes/base/card-specs'
import type { CardImportSpec } from '@/inkling/nodes/base/import-spec'

import { transientInitialFileProp, transientTriggerFileDialogProp } from '@/inkling/nodes/base/card-specs'
import {
  generateDecoratorNode,
  type DecoratorNodeData,
  type DecoratorNodeValueMap,
  type SerializedGeneratedDecoratorNode,
} from '@/inkling/nodes/base/generate-decorator-node'
import { renderAudioNode } from '@/inkling/nodes/base/nodes/audio/audio-renderer'

// The card's transient-prop spec (CONTEXT.md: "card spec") lives here, beside
// the class it types — the declaration imports it from this module. `as const`
// keeps the literal `name`s and `initial` value types on the array's type so
// the `__*` field maps derive both (CardSpecFieldMap / CardSpecFieldMapFor).
export const audioTransientProps = [
  transientTriggerFileDialogProp,
  transientInitialFileProp,
] as const satisfies readonly TransientPropSpec[]

const audioProperties = [
  { name: 'duration', default: 0 },
  { name: 'mimeType', default: '' },
  { name: 'src', default: '', urlType: 'url' },
  { name: 'title', default: '' },
  { name: 'thumbnailSrc', default: '' },
] as const satisfies readonly DecoratorNodeProperty[]

export const audioImportSpec = {
  conversions: [
    {
      tag: 'div',
      priority: 1,
      guardClass: 'inkling-audio-card',
      reads: [
        { name: 'title', kind: 'html', selector: '.inkling-audio-title', trim: true },
        // property reads, not attributes — `.src` absolutizes
        { name: 'src', kind: 'property', property: 'src', selector: '.inkling-audio-player-container audio' },
        {
          name: 'thumbnailSrc',
          kind: 'property',
          property: 'src',
          selector: '.inkling-audio-thumbnail',
          omit: 'falsy',
        },
        {
          name: 'duration',
          kind: 'html',
          selector: '.inkling-audio-duration',
          trim: true,
          omit: 'falsy',
          // audio's m:ss parse — deliberately not unified with video's
          // parseInt variant
          parse: (raw) => {
            const [rawMinutes, rawSeconds = '0'] = raw.split(':')
            const minutes = Number(rawMinutes.trim())
            const seconds = Number(rawSeconds.trim())
            return Number.isInteger(minutes) && Number.isInteger(seconds) ? minutes * 60 + seconds : undefined
          },
        },
      ],
    },
  ],
} satisfies CardImportSpec

export type AudioData = DecoratorNodeData<typeof audioProperties>

export type SerializedAudioNode = SerializedGeneratedDecoratorNode<DecoratorNodeValueMap<typeof audioProperties>>

// Every base card class is named `Base*` (never the card's plain name, which
// belongs to the spec-adopting wrapper/assembled class one layer up). The
// uniform convention also covers the original collision that started it: the
// DOM's global Web Audio `AudioNode` interface — declaration bundlers merge
// the global into their collision scope and mis-rename both.
//
// The merged interface self-types the spec-driven fields/accessors the
// generated class assigns dynamically (the spec arrays above are their single
// source). The fields are initialized only on spec-adopting assembled classes
// — a raw `new BaseAudioNode()` leaves them unset.
// oxlint-disable-next-line typescript/no-empty-object-type -- class+interface merging: self-types the spec-driven fields
export interface BaseAudioNode extends CardSpecFieldMapFor<typeof audioTransientProps> {}
export class BaseAudioNode extends generateDecoratorNode({
  nodeType: 'audio',
  properties: audioProperties,
  defaultRenderFn: renderAudioNode,
  importSpec: audioImportSpec,
}) {}

export const $createBaseAudioNode = (dataset: AudioData = {}) => {
  return new BaseAudioNode(dataset)
}

export function $isAudioNode(node: unknown): node is BaseAudioNode {
  return node instanceof BaseAudioNode
}
