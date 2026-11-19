import type { ImageNodeDataset } from '@kobato/inkling-internal/nodes/ImageNode'
import type { LexicalEditor } from 'lexical'

import { $isImageNode } from '@kobato/inkling-internal/nodes/base/nodes/image/ImageNode'
import { INSERT_CARD_COMMAND } from '@kobato/inkling-internal/plugins/behaviour/commands'
import { getRegisteredNodeMap } from '@kobato/inkling-internal/utils/lexical-internals'
import { $getEditor, $getSelection, COMMAND_PRIORITY_LOW, createCommand, mergeRegister } from 'lexical'

export const INSERT_FROM_GIF_COMMAND = createCommand<ImageNodeDataset>()
export const INSERT_FROM_LIBRARY_COMMAND = createCommand<ImageNodeDataset>()
export function $insertFromSelectorDataset(dataset: ImageNodeDataset): boolean {
  const ImageNodeClass = getRegisteredNodeMap($getEditor()).get('image')?.klass
  if (!ImageNodeClass) {
    return false
  }

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

export function registerSelectorInsertCommands(editor: LexicalEditor): () => void {
  if (!getRegisteredNodeMap(editor).has('image')) {
    return () => undefined
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
