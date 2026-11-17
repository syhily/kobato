import type { AudioNodeDataset } from './cards/card-commands'

import { assembleCardNodeOnce } from './assemble-card-node'
import { audioDeclaration } from './cards/audio.declaration'
export { $isAudioNode } from './base/nodes/audio/AudioNode'
export type { SerializedAudioNode } from './base/nodes/audio/AudioNode'
export { INSERT_AUDIO_COMMAND } from './cards/card-commands'
export type { AudioNodeDataset } from './cards/card-commands'

/**
 * The registered class, assembled once from the card declaration by
 * `assembleCardNodeOnce`; `$isAudioNode` is canonical on the base node. The
 * instance type carries the spec-derived `__*` field map, so `$createAudioNode`
 * needs no cast.
 */
export const AudioNode = assembleCardNodeOnce(audioDeclaration)
export type AudioNode = InstanceType<typeof AudioNode>

export const $createAudioNode = (dataset: AudioNodeDataset): AudioNode => {
  return new AudioNode(dataset)
}
