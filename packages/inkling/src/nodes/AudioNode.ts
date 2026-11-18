import type { AudioNodeDataset } from '@kobato/inkling-internal/nodes/cards/card-commands'

import { assembleCardNodeOnce } from '@kobato/inkling-internal/nodes/assemble-card-node'
import { audioDeclaration } from '@kobato/inkling-internal/nodes/cards/audio.declaration'
export { $isAudioNode } from '@kobato/inkling-internal/nodes/base/nodes/audio/AudioNode'
export type { SerializedAudioNode } from '@kobato/inkling-internal/nodes/base/nodes/audio/AudioNode'
export { INSERT_AUDIO_COMMAND } from '@kobato/inkling-internal/nodes/cards/card-commands'
export type { AudioNodeDataset } from '@kobato/inkling-internal/nodes/cards/card-commands'

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
