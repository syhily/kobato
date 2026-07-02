import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { mergeRegister } from '@lexical/utils'
import { COMMAND_PRIORITY_LOW } from 'lexical'
import React from 'react'

import { $createCalloutNode, CalloutNode, INSERT_CALLOUT_COMMAND } from '@/ui/inkling-editor/nodes/CalloutNode'
import { INSERT_CARD_COMMAND } from '@/ui/inkling-editor/plugins/InklingBehaviourPlugin'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export const CalloutPlugin = () => {
  const [editor] = useLexicalComposerContext()

  React.useEffect(() => {
    if (!editor.hasNodes([CalloutNode])) {
      return
    }
    return mergeRegister(
      editor.registerCommand(
        INSERT_CALLOUT_COMMAND,
        (dataset) => {
          if (!isRecord(dataset)) {
            return false
          }
          const cardNode = $createCalloutNode(dataset)
          editor.dispatchCommand(INSERT_CARD_COMMAND, { cardNode, openInEditMode: true })

          return true
        },
        COMMAND_PRIORITY_LOW,
      ),
    )
  }, [editor])

  return null
}

export default CalloutPlugin
