import type { AudioNodeDataset } from '@/inkling/nodes/cards/card-commands'

import { assembleCardNodeOnce } from '@/inkling/nodes/assemble-card-node'
import { audioDeclaration } from '@/inkling/nodes/cards/audio.declaration'
export { $isAudioNode } from '@/inkling/nodes/base/nodes/audio/AudioNode'
export type { SerializedAudioNode } from '@/inkling/nodes/base/nodes/audio/AudioNode'
export { INSERT_AUDIO_COMMAND } from '@/inkling/nodes/cards/card-commands'
export type { AudioNodeDataset } from '@/inkling/nodes/cards/card-commands'

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
