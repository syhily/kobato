import type { DecoratorNodeProperty } from '@/nodes/base/card-specs'
import type { CardImportSpec } from '@/nodes/base/import-spec'

import {
  generateDecoratorNode,
  type DecoratorNodeData,
  type DecoratorNodeValueMap,
  type SerializedGeneratedDecoratorNode,
} from '@/nodes/base/generate-decorator-node'
import { renderAudioNode } from '@/nodes/base/nodes/audio/audio-renderer'

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
export interface BaseAudioNode extends DecoratorNodeValueMap<typeof audioProperties> {}

export class BaseAudioNode extends generateDecoratorNode({
  nodeType: 'audio',
  properties: audioProperties,
  defaultRenderFn: renderAudioNode,
  importSpec: audioImportSpec,
}) {
  // The transient-prop spec (audio.declaration.ts) initializes this only on
  // spec-adopting assembled classes — the accessor is assembly-defined from
  // the spec (the `declare` leg is type-only, so base-typed write-seam
  // consumers can name it); a raw `new BaseAudioNode()` leaves the field
  // unset, so `undefined` is part of the honest type for spec-less instances
  declare __triggerFileDialog: boolean | undefined
  declare triggerFileDialog: boolean | undefined
}

export const $createBaseAudioNode = (dataset: AudioData = {}) => {
  return new BaseAudioNode(dataset)
}

export function $isAudioNode(node: unknown): node is BaseAudioNode {
  return node instanceof BaseAudioNode
}
