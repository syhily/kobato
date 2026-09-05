import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { COMMAND_PRIORITY_LOW } from 'lexical'
import React from 'react'

import { INSERT_SNIPPET_COMMAND } from '@/nodes/cards/card-commands'
import { $insertSnippet } from '@/plugins/behaviour/snippet-insertion'

export const InklingSnippetPlugin = () => {
  const [editor] = useLexicalComposerContext()

  React.useEffect(() => {
    return editor.registerCommand(
      INSERT_SNIPPET_COMMAND,
      (dataset) => $insertSnippet(editor, dataset),
      COMMAND_PRIORITY_LOW,
    )
  }, [editor])

  return null
}

export default InklingSnippetPlugin
