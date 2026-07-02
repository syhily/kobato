import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { mergeRegister } from '@lexical/utils'
import { $getSelection, COMMAND_PRIORITY_LOW, createCommand } from 'lexical'
import React from 'react'

import GifPlugin from '@/ui/inkling-editor/components/ui/GifPlugin'
import { $createImageNode, ImageNode, type ImageNodeDataset } from '@/ui/inkling-editor/nodes/ImageNode'
import { INSERT_CARD_COMMAND } from '@/ui/inkling-editor/plugins/InklingBehaviourPlugin'

export const OPEN_GIF_SELECTOR_COMMAND = createCommand<ImageNodeDataset>()
export const INSERT_FROM_GIF_COMMAND = createCommand<ImageNodeDataset>()

export const InklingSelectorPlugin = () => {
  const [editor] = useLexicalComposerContext()

  React.useEffect(() => {
    if (!editor.hasNodes([ImageNode])) {
      return
    }
    return mergeRegister(
      editor.registerCommand(
        OPEN_GIF_SELECTOR_COMMAND,
        (dataset) => {
          const cardNode = $createImageNode({
            ...dataset,
            selector: GifPlugin,
            isImageHidden: true,
          })

          editor.dispatchCommand(INSERT_CARD_COMMAND, { cardNode })

          return true
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        INSERT_FROM_GIF_COMMAND,
        (dataset) => {
          const imageNode = $createImageNode(dataset)

          const selection = $getSelection()
          if (!selection) {
            return false
          }
          const selectedNode = selection.getNodes()[0]

          editor.dispatchCommand(INSERT_CARD_COMMAND, { cardNode: imageNode })
          selectedNode.remove()

          return true
        },
        COMMAND_PRIORITY_LOW,
      ),
    )
  }, [editor])

  return null
}

export default InklingSelectorPlugin
