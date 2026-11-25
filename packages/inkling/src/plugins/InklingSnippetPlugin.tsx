import { INSERT_SNIPPET_COMMAND } from '@kobato/inkling-internal/nodes/cards/card-commands'
import { $insertSnippet } from '@kobato/inkling-internal/plugins/behaviour/snippet-insertion'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { COMMAND_PRIORITY_LOW } from 'lexical'
import { useEffect } from 'react'
export const InklingSnippetPlugin = () => {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    return editor.registerCommand(
      INSERT_SNIPPET_COMMAND,
      (dataset) => $insertSnippet(editor, dataset),
      COMMAND_PRIORITY_LOW,
    )
  }, [editor])

  return null
}

export default InklingSnippetPlugin
