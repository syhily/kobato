import {
  generateDecoratorNode,
  type DecoratorNodeData,
  type DecoratorNodeProperty,
  type DecoratorNodeValueMap,
} from '@/ui/inkling-editor/nodes/base/generate-decorator-node'
import { parseAudioNode } from '@/ui/inkling-editor/nodes/base/nodes/audio/audio-parser'
import { renderAudioNode } from '@/ui/inkling-editor/nodes/base/nodes/audio/audio-renderer'

const audioProperties = [
  { name: 'duration', default: 0 },
  { name: 'mimeType', default: '' },
  { name: 'src', default: '', urlType: 'url' },
  { name: 'title', default: '' },
  { name: 'thumbnailSrc', default: '' },
] as const satisfies readonly DecoratorNodeProperty[]

export type AudioData = DecoratorNodeData<typeof audioProperties>

export interface AudioNode extends DecoratorNodeValueMap<typeof audioProperties> {}

export class AudioNode extends generateDecoratorNode({
  nodeType: 'audio',
  properties: audioProperties,
  defaultRenderFn: renderAudioNode,
}) {
  static importDOM() {
    return parseAudioNode(this)
  }
}

export const $createAudioNode = (dataset: AudioData = {}) => {
  return new AudioNode(dataset)
}

export function $isAudioNode(node: unknown): node is AudioNode {
  return node instanceof AudioNode
}
