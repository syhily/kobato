import type { VideoNodeDataset } from '@/inkling/nodes/cards/card-commands'

import { assembleCardNodeOnce } from '@/inkling/nodes/assemble-card-node'
import { videoDeclaration } from '@/inkling/nodes/cards/video.declaration'
export { $isVideoNode } from '@/inkling/nodes/base/nodes/video/VideoNode'
export type { SerializedVideoNode } from '@/inkling/nodes/base/nodes/video/VideoNode'
export { INSERT_VIDEO_COMMAND } from '@/inkling/nodes/cards/card-commands'
export type { VideoNodeDataset } from '@/inkling/nodes/cards/card-commands'

/**
 * The registered class, assembled once from the card declaration by
 * `assembleCardNodeOnce`; `$isVideoNode` is canonical on the base node. The
 * instance type carries the spec-derived `__*` field map, so `$createVideoNode`
 * needs no cast.
 */
export const VideoNode = assembleCardNodeOnce(videoDeclaration)
export type VideoNode = InstanceType<typeof VideoNode>

export const $createVideoNode = (dataset: VideoNodeDataset): VideoNode => {
  return new VideoNode(dataset)
}
