import type { LexicalEditor } from 'lexical'

import { $getEditor, $getSelection, COMMAND_PRIORITY_LOW, createCommand, mergeRegister } from 'lexical'

import type { ImageNodeDataset } from '@/nodes/ImageNode'

import { $isImageNode } from '@/nodes/base/nodes/image/ImageNode'
import { INSERT_CARD_COMMAND } from '@/plugins/behaviour/commands'
import { getRegisteredNodeMap } from '@/utils/lexical-internals'

// Selector insertion — the headless surgery behind the gif and image-library
// selector overlays: build the card from the
// picked dataset, insert it through the shared card insert command, and
// remove the placeholder node the overlay rode on.
// INSERT_FROM_GIF_COMMAND and INSERT_FROM_LIBRARY_COMMAND share the one
// surgery; both commands keep their own names so menu/analytics semantics
// stay distinct — if either ever diverges, split the function back out.
// InklingSelectorPlugin keeps only the OPEN_* placeholder dispatches (they
// name the React overlay components).

export const INSERT_FROM_GIF_COMMAND = createCommand<ImageNodeDataset>()
export const INSERT_FROM_LIBRARY_COMMAND = createCommand<ImageNodeDataset>()

/**
 * Applies a selector pick: inserts the image card built from the picked
 * dataset at the selection, then removes the placeholder node the overlay
 * rode on (the first selected node). Returns false — leaving the tree
 * untouched — when the image card is not registered, or when there is no
 * selection/placeholder to replace. The class comes from the registered-node
 * map, not the shim, so this module stays off the decorate tree.
 */
export function $insertFromSelectorDataset(dataset: ImageNodeDataset): boolean {
  const ImageNodeClass = getRegisteredNodeMap($getEditor()).get('image')?.klass
  if (!ImageNodeClass) {
    return false
  }

  // a registry key could resolve to a non-image class (a host replaced it) —
  // check the constructed node instead of asserting
  const imageNode = new ImageNodeClass(dataset)
  if (!$isImageNode(imageNode)) {
    return false
  }

  const selection = $getSelection()
  if (!selection) {
    return false
  }
  const selectedNode = selection.getNodes()[0]
  if (!selectedNode) {
    return false
  }

  $getEditor().dispatchCommand(INSERT_CARD_COMMAND, { cardNode: imageNode })
  selectedNode.remove()

  return true
}

/**
 * Registers both selector insert commands on the editor. No-ops when the
 * image card is not registered (the selector overlays are image
 * placeholders — nothing can be picked into a surface without it).
 */
export function registerSelectorInsertCommands(editor: LexicalEditor): () => void {
  if (!getRegisteredNodeMap(editor).has('image')) {
    return () => {}
  }
  return mergeRegister(
    editor.registerCommand(
      INSERT_FROM_GIF_COMMAND,
      (dataset) => $insertFromSelectorDataset(dataset),
      COMMAND_PRIORITY_LOW,
    ),
    editor.registerCommand(
      INSERT_FROM_LIBRARY_COMMAND,
      (dataset) => $insertFromSelectorDataset(dataset),
      COMMAND_PRIORITY_LOW,
    ),
  )
}
