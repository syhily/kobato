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

import type { BaseImageNode } from '@/inkling/nodes/base/nodes/image/ImageNode'
import type { ImageNodeDataset } from '@/inkling/nodes/ImageNode'
import type { CardDraggableInfo, DraggableInfo } from '@/inkling/utils/draggable/DragDropContainer'

import { $isImageNode } from '@/inkling/nodes/base/nodes/image/ImageNode'
import { getImageFilenameFromSrc } from '@/inkling/nodes/base/utils/content-image-url'
import { datasetToGalleryImage } from '@/inkling/nodes/base/utils/gallery-image-fill'
import { $isGalleryNode } from '@/inkling/nodes/GalleryNode'
import { getRegisteredNodeMap } from '@/inkling/utils/lexical-internals'

// Drop surgery — the headless $-surgeries behind DragDropReorderPlugin. The
// reorder rules own the drop decisions (allowance, insertIndex derivation,
// drop-time verification); this module owns applying a resolved drop to the
// editor tree: relocating a dragged card, merging an image dropped onto an
// image into a gallery, inserting a gallery-dragged image, and the
// source-removal policy for cross-card drops. Rules decide, surgeries apply.
//
// The $-functions must run inside editor.update()/editor.read().

/**
 * Moves the dragged card to the resolved drop slot: before the droppable at
 * `insertIndex`, or after the last droppable when the index runs past the end
 * of the document. Clears the selection so no toolbar pops back up over the
 * moved card and the caret is not left stranded. Returns false — leaving the
 * tree and the selection untouched — when the node key no longer resolves or
 * the droppable scan came back empty.
 */
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

/**
 * Inserts a new image card built from the dragged image's dataset before the
 * droppable at `insertIndex` and selects it (images can be dragged out of a
 * gallery). Returns null when the slot does not resolve to a node — the caller
 * maps null to a failed drop (the source node stays) — or when the editor does
 * not register the image card (the class comes from the registered-node map,
 * not the shim, so this module stays off the decorate tree).
 */
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

  // a registry key could resolve to a non-image class (a host replaced it) —
  // check the constructed node instead of asserting
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

/**
 * Merges an image card dropped onto another image card into a two-image
 * gallery: the gallery takes the target's slot (target image first, dragged
 * image second) and the dragged card's source node is removed. Returns false —
 * leaving the tree untouched — when either key no longer resolves to an image
 * card, when either dataset lacks a src, or when the editor does not register
 * the gallery card.
 */
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

  // a registry key could resolve to a non-gallery class (a host replaced it) —
  // check the constructed node instead of asserting
  const galleryNode = new GalleryNodeClass({})
  if (!$isGalleryNode(galleryNode)) {
    return false
  }

  // `||` over `??` is deliberate: an empty-string fileName is as useless as a
  // missing one, and datasetToGalleryImage applies the same fallback. The copy
  // keeps the caller's object unmutated.
  const draggedFileName = typeof draggedDataset.fileName === 'string' ? draggedDataset.fileName : undefined
  const filledDraggedDataset = {
    ...draggedDataset,
    fileName: draggedFileName || getImageFilenameFromSrc(String(draggedDataset.src)),
  }

  // the shared fill policy carries the fields addImages persists
  // (ALLOWED_IMAGE_PROPS) instead of casting the whole dataset; a src-less
  // dataset is not an image and rejects the merge
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

/** A card drag whose card is the image card — the gallery-merge payload. */
export type ImageCardDraggableInfo = CardDraggableInfo & { cardName: 'image' }

/**
 * The image-card-onto-image drop allowance (gallery creation): the payload is
 * an image CARD dragged from a different node than the target. Whether the key
 * still resolves is the surgery's concern — a card deleted mid-drag is a stale
 * node, not a malformed payload.
 */
export function isImageCardDropAllowed(
  draggable: DraggableInfo,
  targetNodeKey: NodeKey,
): draggable is ImageCardDraggableInfo {
  return draggable.type === 'card' && draggable.cardName === 'image' && draggable.nodeKey !== targetNodeKey
}

/**
 * Applies the image-card-onto-image drop: merges both cards into a gallery
 * ($mergeImagesIntoGallery — the gallery takes the target's slot). Returns
 * without touching the tree when the allowance fails.
 */
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

/**
 * The source-removal policy for cross-card drops: the dragged card's source
 * node is removed only when the drop succeeded in another container (success
 * without sourceHandled) — a same-container reorder reports sourceHandled, and
 * a failed drop removes nothing.
 */
export function shouldRemoveDropSource(success: boolean, sourceHandled: boolean): boolean {
  return !sourceHandled && success
}

/**
 * Removes the dragged card's source node after a cross-card drop. Returns
 * false when the key no longer resolves — the card can be deleted mid-drag.
 */
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
