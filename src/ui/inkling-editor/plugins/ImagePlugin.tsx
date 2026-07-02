import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { mergeRegister } from '@lexical/utils'
import { COMMAND_PRIORITY_HIGH, COMMAND_PRIORITY_LOW } from 'lexical'
import React from 'react'

import InklingComposerContext from '@/ui/inkling-editor/context/InklingComposerContext'
import {
  $createImageNode,
  ImageNode,
  type ImageNodeDataset,
  INSERT_IMAGE_COMMAND,
} from '@/ui/inkling-editor/nodes/ImageNode'
import { INSERT_MEDIA_COMMAND } from '@/ui/inkling-editor/plugins/DragDropPastePlugin'
import { INSERT_CARD_COMMAND } from '@/ui/inkling-editor/plugins/InklingBehaviourPlugin'
import { imageUploadHandler } from '@/ui/inkling-editor/utils/imageUploadHandler'

function isImageNodeDataset(value: unknown): value is ImageNodeDataset {
  return typeof value === 'object' && value !== null
}

export const ImagePlugin = () => {
  const [editor] = useLexicalComposerContext()
  const { fileUploader } = React.useContext(InklingComposerContext)

  const imageUploader = fileUploader.useFileUpload('image')

  const handleImageUpload = React.useCallback(
    async (files: File[], imageNodeKey: string) => {
      if (files?.length > 0) {
        return await imageUploadHandler(files, imageNodeKey, editor, imageUploader.upload)
      }
    },
    [imageUploader.upload, editor],
  )

  React.useEffect(() => {
    if (!editor.hasNodes([ImageNode])) {
      return
    }
    return mergeRegister(
      editor.registerCommand(
        INSERT_IMAGE_COMMAND,
        (dataset) => {
          if (!isImageNodeDataset(dataset)) {
            return false
          }
          const cardNode = $createImageNode(dataset)
          editor.dispatchCommand(INSERT_CARD_COMMAND, { cardNode })

          return true
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        INSERT_MEDIA_COMMAND,
        (dataset) => {
          if (dataset.type === 'image') {
            editor.dispatchCommand(INSERT_IMAGE_COMMAND, { initialFile: dataset.file })
            return true
          }
          return false
        },
        COMMAND_PRIORITY_HIGH,
      ),
    )
  }, [editor, fileUploader, handleImageUpload])

  return null
}

export default ImagePlugin
