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

import type { BaseImageNode } from '@/nodes/base/nodes/image/ImageNode'
import type { ImageNodeDataset } from '@/nodes/ImageNode'
import type { DraggableInfo } from '@/utils/draggable/DragDropContainer'

import { $isImageNode } from '@/nodes/base/nodes/image/ImageNode'
import { getImageFilenameFromSrc } from '@/nodes/base/utils/content-image-url'
import { datasetToGalleryImage } from '@/nodes/base/utils/gallery-image-fill'
import { $isGalleryNode } from '@/nodes/GalleryNode'
import { getRegisteredNodeMap } from '@/utils/lexical-internals'

// Drop surgery — the headless $-surgeries behind DragDropReorderPlugin. The
// reorder rules (@/utils/draggable/reorder-rules) own the drop decisions
// (allowance, insertIndex derivation, drop-time verification); this module
// owns applying a resolved drop to the editor tree: relocating a dragged
// card, merging an image dropped onto an image into a gallery, inserting a
// gallery-dragged image, and the source-removal policy for cross-card drops.
// The plugin keeps the DOM/selector glue, the handler lifecycle, and the
// DropResult mapping — rules decide, surgeries apply.
//
// The $-functions must run inside editor.update()/editor.read().

/**
 * Moves the dragged card to the resolved drop slot: before the droppable at
 * `insertIndex`, or after the last droppable when the index runs past the end
 * of the document. Clears the selection so no toolbar pops back up over the
 * moved card and the caret is not left stranded somewhere else in the
 * document. Returns false — leaving the tree and the selection untouched —
 * when the node key no longer resolves or the droppable scan came back empty
 * (an empty scan has no slot to resolve; a no-op must not report success).
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
    // drop at end of document
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

  // clear selection so we don't show any toolbars immediately and the cursor
  // isn't left stranded somewhere else in the document
  $setSelection(null)
  return true
}

/**
 * Inserts a new image card built from the dragged image's dataset before the
 * droppable at `insertIndex` and selects it (images can be dragged out of a
 * gallery). Returns the created node, or null when the slot does not resolve
 * to a node — the caller maps null to a failed drop (the source node stays).
 * Also null when the editor doesn't
 * register the image card (the class comes from the registered-node map, not
 * the shim, so this module stays off the decorate tree; unreachable there in
 * practice — only gallery drags reach this path, and core has no gallery).
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

  // select the newly inserted image card
  const nodeSelection = $createNodeSelection()
  nodeSelection.add(imageNode.getKey())
  $setSelection(nodeSelection)
  return imageNode
}

/**
 * Merges an image card dropped onto another image card into a two-image
 * gallery: the gallery takes the target's slot (target image first, dragged
 * image second) and the dragged card's source node is removed. Image datasets
 * carry no fileName, so a copy of the dragged payload's dataset gets the
 * src-derived one (the shared fill policy applies the same fallback for the
 * conversion itself).
 * Returns false — leaving the tree untouched — when either key no longer
 * resolves to an image card, when either dataset lacks a src, or when the
 * editor doesn't register the gallery card (the class comes from the
 * registered-node map, not the shim, so this module stays off the decorate
 * tree).
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

  // a registry key could resolve to a non-gallery class (a host replaced
  // it) — check the constructed node instead of asserting, like the image
  // path in $insertDraggedImage
  const galleryNode = new GalleryNodeClass({})
  if (!$isGalleryNode(galleryNode)) {
    return false
  }

  // images don't contain the filename dataset property so we need to add
  // it — on a copy of the payload, not by mutating the caller's object (the
  // shared fill policy applies the same fallback for the conversion itself).
  // `||` over `??` is deliberate: an empty-string fileName is as useless as a
  // missing one, and datasetToGalleryImage applies the same fallback.
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

/**
 * The image-card-onto-image drop allowance (gallery creation): the payload
 * is an image CARD dragged from a different node than the target.
 */
export function isImageCardDropAllowed(draggable: DraggableInfo, targetNodeKey: NodeKey): boolean {
  return (
    draggable.type === 'card' &&
    draggable.cardName === 'image' &&
    !!draggable.nodeKey &&
    draggable.nodeKey !== targetNodeKey
  )
}

/**
 * Applies the image-card-onto-image drop: merges both cards into a gallery
 * ($mergeImagesIntoGallery — the gallery takes the target's slot). Returns
 * false when the allowance fails or the payload carries no key/dataset. The
 * drop target's `onDrop` returns `undefined` regardless — the merge is its
 * own acknowledgement, matching the historical glue.
 */
export function applyImageCardDrop(editor: LexicalEditor, targetNodeKey: NodeKey, draggable: DraggableInfo): void {
  if (!isImageCardDropAllowed(draggable, targetNodeKey) || !draggable.nodeKey || !draggable.dataset) {
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
 * without sourceHandled) — a same-container reorder reports sourceHandled,
 * and a failed drop removes nothing.
 */
export function shouldRemoveDropSource(
  draggableType: string | undefined,
  success: boolean,
  sourceHandled: boolean,
): boolean {
  return !sourceHandled && success && draggableType === 'card'
}

/**
 * Removes the dragged card's source node after a cross-card drop. Returns
 * false when the key no longer resolves.
 */
export function $removeDropSource(nodeKey: NodeKey | undefined): boolean {
  const cardNode = nodeKey ? $getNodeByKey(nodeKey) : null
  if (!cardNode) {
    return false
  }
  cardNode.remove(false)
  return true
}

/**
 * The drag-marker refresh policy: should a document update refresh the
 * drag/drop markers? Refresh only when the set, order, or DOM identity of
 * top-level blocks may have changed. Text edits only mark the edited node's
 * ancestors as dirty *parents* (flag false), so per-keystroke updates skip
 * the refresh; a direct root child being intentionally dirty (cloned) means
 * a block was added, removed, reordered, or re-rendered — and the
 * reconciler recreates its DOM. Lexical 0.46 marks the root itself
 * intentionally dirty on every update ($applyAllTransforms), so the root's
 * own flag is ignored. The plugin additionally forces a refresh on drag
 * start as a final safety net.
 *
 * Not a $-function: it takes the update-listener payload and runs the read
 * itself, so the plugin's listener body is a one-line adapter.
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
      if (node && node.getParent() === root) {
        return true
      }
    }
    return false
  })
}
