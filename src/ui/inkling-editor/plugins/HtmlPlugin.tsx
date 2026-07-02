import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { mergeRegister } from '@lexical/utils'
import { COMMAND_PRIORITY_LOW } from 'lexical'
import React from 'react'

import { $createHtmlNode, HtmlNode, INSERT_HTML_COMMAND } from '@/ui/inkling-editor/nodes/HtmlNode'
import { INSERT_CARD_COMMAND } from '@/ui/inkling-editor/plugins/InklingBehaviourPlugin'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export const HtmlPlugin = () => {
  const [editor] = useLexicalComposerContext()

  React.useEffect(() => {
    if (!editor.hasNodes([HtmlNode])) {
      return
    }
    return mergeRegister(
      editor.registerCommand(
        INSERT_HTML_COMMAND,
        (dataset) => {
          if (!isRecord(dataset)) {
            return false
          }
          const cardNode = $createHtmlNode(dataset)
          editor.dispatchCommand(INSERT_CARD_COMMAND, { cardNode, openInEditMode: true })

          return true
        },
        COMMAND_PRIORITY_LOW,
      ),
    )
  }, [editor])

  return null
}

export default HtmlPlugin
