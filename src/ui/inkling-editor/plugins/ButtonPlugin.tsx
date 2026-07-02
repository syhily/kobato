import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { mergeRegister } from '@lexical/utils'
import { COMMAND_PRIORITY_LOW } from 'lexical'
import React from 'react'

import { $createButtonNode, ButtonNode, INSERT_BUTTON_COMMAND } from '@/ui/inkling-editor/nodes/ButtonNode'
import { INSERT_CARD_COMMAND } from '@/ui/inkling-editor/plugins/InklingBehaviourPlugin'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export const ButtonPlugin = () => {
  const [editor] = useLexicalComposerContext()

  React.useEffect(() => {
    if (!editor.hasNodes([ButtonNode])) {
      return
    }
    return mergeRegister(
      editor.registerCommand(
        INSERT_BUTTON_COMMAND,
        (dataset) => {
          if (!isRecord(dataset)) {
            return false
          }
          const cardNode = $createButtonNode(dataset)
          editor.dispatchCommand(INSERT_CARD_COMMAND, { cardNode, openInEditMode: true })

          return true
        },
        COMMAND_PRIORITY_LOW,
      ),
    )
  }, [editor])

  return null
}

export default ButtonPlugin
