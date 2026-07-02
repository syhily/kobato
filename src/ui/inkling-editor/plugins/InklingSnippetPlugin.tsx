import { $generateNodesFromSerializedNodes, $insertGeneratedNodes } from '@lexical/clipboard'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { mergeRegister } from '@lexical/utils'
import { $createParagraphNode, $getSelection, COMMAND_PRIORITY_LOW, createCommand } from 'lexical'
import React from 'react'

import { $isInklingCard } from '@/ui/inkling-editor/nodes/base'
import { INSERT_CARD_COMMAND } from '@/ui/inkling-editor/plugins/InklingBehaviourPlugin'

export const INSERT_SNIPPET_COMMAND = createCommand('INSERT_SNIPPET_COMMAND')

export const InklingSnippetPlugin = () => {
  const [editor] = useLexicalComposerContext()

  React.useEffect(() => {
    return mergeRegister(
      editor.registerCommand(
        INSERT_SNIPPET_COMMAND,
        (dataset) => {
          editor.update(() => {
            const snippetData = JSON.parse((dataset as { value: string }).value)
            const nodes = $generateNodesFromSerializedNodes(snippetData.nodes)
            const firstNode = nodes.length === 1 && nodes[0]
            const lastNode = !!nodes.length && nodes[nodes.length - 1]

            if (firstNode && $isInklingCard(firstNode)) {
              editor.dispatchCommand(INSERT_CARD_COMMAND, { cardNode: firstNode })

              return true
            }

            const selection = $getSelection()
            $insertGeneratedNodes(editor, nodes, selection!)

            if (lastNode && $isInklingCard(lastNode) && !lastNode.getNextSibling()) {
              try {
                const paragraph = $createParagraphNode()
                lastNode.getTopLevelElementOrThrow().insertAfter(paragraph)
              } catch (_e) {
                // ignore insertion errors
              }
            }
          })
          return true
        },
        COMMAND_PRIORITY_LOW,
      ),
    )
  }, [editor])

  return null
}

export default InklingSnippetPlugin
