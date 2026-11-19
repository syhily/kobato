import type { BaseImageNode } from '@kobato/inkling-internal/nodes/base/nodes/image/ImageNode'
import type { ImageNodeDataset } from '@kobato/inkling-internal/nodes/ImageNode'
import type { CardDraggableInfo, DraggableInfo } from '@kobato/inkling-internal/utils/draggable/DragDropContainer'

import { $isImageNode } from '@kobato/inkling-internal/nodes/base/nodes/image/ImageNode'
import { getImageFilenameFromSrc } from '@kobato/inkling-internal/nodes/base/utils/content-image-url'
import { datasetToGalleryImage } from '@kobato/inkling-internal/nodes/base/utils/gallery-image-fill'
import { $isGalleryNode } from '@kobato/inkling-internal/nodes/GalleryNode'
import { getRegisteredNodeMap } from '@kobato/inkling-internal/utils/lexical-internals'
import {
  $createNodeSelection,
  $getEditor,
  $getNearestNodeFromDOMNode,
  $getNodeByKey,
  $getRoot,
  $setSelection,
  type EditorState,
  type LexicalEditor,
  type NodeKey,
} from 'lexical'

export function $relocateCard(nodeKey: NodeKey | undefined, droppables: HTMLElement[], insertIndex: number): boolean {
  const draggedNode = nodeKey ? $getNodeByKey(nodeKey) : null
  if (!draggedNode) {
    return false
  }
  if (droppables.length === 0) {
    return false
  }

  if (insertIndex >= droppables.length) {
    const targetNode = $getNearestNodeFromDOMNode(droppables[droppables.length - 1])
    if (targetNode) {
      targetNode.insertAfter(draggedNode)
    }
  } else {
    const targetNode = $getNearestNodeFromDOMNode(droppables[insertIndex])
    if (targetNode) {
      targetNode.insertBefore(draggedNode)
    }
  }

  $setSelection(null)
  return true
}

export function $insertDraggedImage(
  dataset: ImageNodeDataset,
  droppables: HTMLElement[],
  insertIndex: number,
): BaseImageNode | null {
  const ImageNodeClass = getRegisteredNodeMap($getEditor()).get('image')?.klass
  if (!ImageNodeClass) {
    return null
  }
  const targetNode = $getNearestNodeFromDOMNode(droppables[insertIndex])
  if (!targetNode) {
    return null
  }

  const imageNode = new ImageNodeClass(dataset)
  if (!$isImageNode(imageNode)) {
    return null
  }
  targetNode.insertBefore(imageNode)

  const nodeSelection = $createNodeSelection()
  nodeSelection.add(imageNode.getKey())
  $setSelection(nodeSelection)
  return imageNode
}

export function $mergeImagesIntoGallery(
  targetImageKey: NodeKey,
  draggedImageKey: NodeKey,
  draggedDataset: Record<string, unknown>,
): boolean {
  const targetImageNode = $getNodeByKey(targetImageKey)
  const droppedImageNode = $getNodeByKey(draggedImageKey)

  if (!$isImageNode(targetImageNode) || !$isImageNode(droppedImageNode)) {
    return false
  }

  const GalleryNodeClass = getRegisteredNodeMap($getEditor()).get('gallery')?.klass
  if (!GalleryNodeClass) {
    return false
  }
  const galleryNode = new GalleryNodeClass({})
  if (!$isGalleryNode(galleryNode)) {
    return false
  }

  const draggedFileName = typeof draggedDataset.fileName === 'string' ? draggedDataset.fileName : undefined
  const filledDraggedDataset = {
    ...draggedDataset,
    fileName: draggedFileName || getImageFilenameFromSrc(String(draggedDataset.src)),
  }

  const targetImage = datasetToGalleryImage(targetImageNode.getDataset())
  const draggedImage = datasetToGalleryImage(filledDraggedDataset)
  if (!targetImage || !draggedImage) {
    return false
  }
  galleryNode.addImages([targetImage, draggedImage])

  targetImageNode.replace(galleryNode)
  droppedImageNode.remove()
  return true
}

export type ImageCardDraggableInfo = CardDraggableInfo & { cardName: 'image' }

export function isImageCardDropAllowed(
  draggable: DraggableInfo,
  targetNodeKey: NodeKey,
): draggable is ImageCardDraggableInfo {
  return draggable.type === 'card' && draggable.cardName === 'image' && draggable.nodeKey !== targetNodeKey
}

export function applyImageCardDrop(editor: LexicalEditor, targetNodeKey: NodeKey, draggable: DraggableInfo): void {
  if (!isImageCardDropAllowed(draggable, targetNodeKey)) {
    return
  }
  const draggedImageKey = draggable.nodeKey
  const draggedDataset = draggable.dataset
  editor.update(() => {
    $mergeImagesIntoGallery(targetNodeKey, draggedImageKey, draggedDataset)
  })
}

export function shouldRemoveDropSource(success: boolean, sourceHandled: boolean): boolean {
  return !sourceHandled && success
}

export function $removeDropSource(nodeKey: NodeKey): boolean {
  const cardNode = $getNodeByKey(nodeKey)
  if (!cardNode) {
    return false
  }
  cardNode.remove(false)
  return true
}

/**
 * The drag-marker refresh policy: refresh only when the set, order, or DOM
 * identity of top-level blocks may have changed. Text edits only mark the
 * edited node's ancestors as dirty *parents* (flag false), so per-keystroke
 * updates skip the refresh; a direct root child being intentionally dirty
 * (cloned) means a block was added, removed, reordered, or re-rendered.
 * Lexical marks the root itself intentionally dirty on every update
 * ($applyAllTransforms), so the root's own flag is ignored.
 */
export function resolveDragMarkerRefresh(dirtyElements: Map<NodeKey, boolean>, editorState: EditorState): boolean {
  let hasDirtyRootChildCandidate = false
  for (const [key, intentionallyDirty] of dirtyElements) {
    if (key !== 'root' && intentionallyDirty) {
      hasDirtyRootChildCandidate = true
      break
    }
  }
  if (!hasDirtyRootChildCandidate) {
    return false
  }
  return editorState.read(() => {
    const root = $getRoot()
    for (const [key, intentionallyDirty] of dirtyElements) {
      if (key === 'root' || !intentionallyDirty) {
        continue
      }
      const node = $getNodeByKey(key)
      if (node?.getParent() === root) {
        return true
      }
    }
    return false
  })
}
