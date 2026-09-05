/**
 * Compile-time contract fixtures for the card write seam (`$updateCardNode`).
 *
 * This file is included by the root tsconfig (unlike test/unit) and is only
 * type-checked — it is never executed and contains no runtime assertions.
 */
import type { NodeKey } from 'lexical'

import { $isGalleryNode, $isVideoNode, $updateCardNode } from '@/nodes/base'

declare const nodeKey: NodeKey

// --- positive cases ---------------------------------------------------------

// dataset fields take their declared value types
$updateCardNode(nodeKey, $isVideoNode, (node) => {
  node.src = 'https://example.com/a.mp4'
  node.width = 3
})

// declared accessors and methods are reachable through the seam
$updateCardNode(nodeKey, $isVideoNode, (node) => {
  node.triggerFileDialog = false
})
$updateCardNode(nodeKey, $isGalleryNode, (node) => {
  node.setImages([])
})

// --- negative cases ---------------------------------------------------------

$updateCardNode(nodeKey, $isVideoNode, (node) => {
  // @ts-expect-error - wrong value type for a known dataset field
  node.src = 5
})

$updateCardNode(nodeKey, $isVideoNode, (node) => {
  // @ts-expect-error - wrong value type for a nullable dataset field
  node.width = 'wide'
})
