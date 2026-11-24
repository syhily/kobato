import type {
  CardSpecFieldMapFor,
  DecoratorNodeProperty,
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
import { renderAudioNode } from '@kobato/inkling-internal/nodes/base/nodes/audio/audio-renderer'

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

// oxlint-disable-next-line typescript/no-empty-object-type
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
