import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { mergeRegister } from '@lexical/utils'
import { COMMAND_PRIORITY_LOW } from 'lexical'
import React from 'react'

import { $createGalleryNode, GalleryNode, INSERT_GALLERY_COMMAND } from '@/ui/inkling-editor/nodes/GalleryNode'
import { INSERT_CARD_COMMAND } from '@/ui/inkling-editor/plugins/InklingBehaviourPlugin'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export const GalleryPlugin = () => {
  const [editor] = useLexicalComposerContext()

  React.useEffect(() => {
    if (!editor.hasNodes([GalleryNode])) {
      return
    }
    return mergeRegister(
      editor.registerCommand(
        INSERT_GALLERY_COMMAND,
        (dataset) => {
          if (!isRecord(dataset)) {
            return false
          }
          const cardNode = $createGalleryNode(dataset)
          editor.dispatchCommand(INSERT_CARD_COMMAND, { cardNode })

          return true
        },
        COMMAND_PRIORITY_LOW,
      ),
    )
  }, [editor])

  return null
}

export default GalleryPlugin
