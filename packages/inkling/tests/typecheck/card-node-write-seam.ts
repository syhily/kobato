import type { NodeKey } from 'lexical'

import { $isGalleryNode, $isVideoNode, $updateCardNode } from '@kobato/inkling-internal/nodes/base'

declare const nodeKey: NodeKey

$updateCardNode(nodeKey, $isVideoNode, (node) => {
  node.src = 'https://example.com/a.mp4'
  node.width = 3
})

$updateCardNode(nodeKey, $isVideoNode, (node) => {
  node.triggerFileDialog = false
})
$updateCardNode(nodeKey, $isGalleryNode, (node) => {
  node.setImages([])
})

$updateCardNode(nodeKey, $isVideoNode, (node) => {
  // @ts-expect-error - wrong value type for a known dataset field
  node.src = 5
})

$updateCardNode(nodeKey, $isVideoNode, (node) => {
  // @ts-expect-error - wrong value type for a nullable dataset field
  node.width = 'wide'
})
