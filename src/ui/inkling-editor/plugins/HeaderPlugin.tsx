import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { mergeRegister } from '@lexical/utils'
import { COMMAND_PRIORITY_LOW } from 'lexical'
import React from 'react'

import { $createHeaderNode, HeaderNode, INSERT_HEADER_COMMAND } from '@/ui/inkling-editor/nodes/HeaderNode'
import { INSERT_CARD_COMMAND } from '@/ui/inkling-editor/plugins/InklingBehaviourPlugin'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export const HeaderPlugin = () => {
  const [editor] = useLexicalComposerContext()

  React.useEffect(() => {
    if (!editor.hasNodes([HeaderNode])) {
      return
    }
    return mergeRegister(
      editor.registerCommand(
        INSERT_HEADER_COMMAND,
        (dataset) => {
          if (!isRecord(dataset)) {
            return false
          }
          const cardNode = $createHeaderNode(dataset)
          editor.dispatchCommand(INSERT_CARD_COMMAND, { cardNode, openInEditMode: true })

          return true
        },
        COMMAND_PRIORITY_LOW,
      ),
    )
  })

  return null
}

export default HeaderPlugin
