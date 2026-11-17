import type { VideoNodeDataset } from './cards/card-commands'

import { assembleCardNodeOnce } from './assemble-card-node'
import { videoDeclaration } from './cards/video.declaration'
export { $isVideoNode } from './base/nodes/video/VideoNode'
export type { SerializedVideoNode } from './base/nodes/video/VideoNode'
export { INSERT_VIDEO_COMMAND } from './cards/card-commands'
export type { VideoNodeDataset } from './cards/card-commands'

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
