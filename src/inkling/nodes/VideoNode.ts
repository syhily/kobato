import type { VideoNodeDataset } from '@/inkling/nodes/cards/card-commands'

import { assembleCardNodeOnce } from '@/inkling/nodes/assemble-card-node'
import { videoDeclaration } from '@/inkling/nodes/cards/video.declaration'
export { $isVideoNode } from '@/inkling/nodes/base/nodes/video/VideoNode'
export type { SerializedVideoNode } from '@/inkling/nodes/base/nodes/video/VideoNode'
export { INSERT_VIDEO_COMMAND } from '@/inkling/nodes/cards/card-commands'
export type { VideoNodeDataset } from '@/inkling/nodes/cards/card-commands'

/**
 * The registered class is assembled from the card declaration, and
 * `$isVideoNode` is canonical on the base node. The instance type carries
 * the spec-derived `__*` field map (names and value types from the
 * declaration's spec via CardSpecFieldMap), so `$createVideoNode`
 * constructs the assembled class — which initializes the nested-editor and
 * transient-prop specs — with no cast.
 */
export const VideoNode = assembleCardNodeOnce(videoDeclaration)
export type VideoNode = InstanceType<typeof VideoNode>

export const $createVideoNode = (dataset: VideoNodeDataset): VideoNode => {
  // the nested-editor and transient fields are initialized by the constructor from the dataset
  return new VideoNode(dataset)
}
