import type { VideoNodeDataset } from '@kobato/inkling-internal/nodes/cards/card-commands'

import { assembleCardNodeOnce } from '@kobato/inkling-internal/nodes/assemble-card-node'
import { videoDeclaration } from '@kobato/inkling-internal/nodes/cards/video.declaration'
export { $isVideoNode } from '@kobato/inkling-internal/nodes/base/nodes/video/VideoNode'
export type { SerializedVideoNode } from '@kobato/inkling-internal/nodes/base/nodes/video/VideoNode'
export { INSERT_VIDEO_COMMAND } from '@kobato/inkling-internal/nodes/cards/card-commands'
export type { VideoNodeDataset } from '@kobato/inkling-internal/nodes/cards/card-commands'

export const VideoNode = assembleCardNodeOnce(videoDeclaration)
export type VideoNode = InstanceType<typeof VideoNode>
export const $createVideoNode = (dataset: VideoNodeDataset): VideoNode => {
  return new VideoNode(dataset)
}
