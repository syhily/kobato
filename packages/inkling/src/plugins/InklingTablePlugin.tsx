import { registerTableBehaviour } from '@kobato/inkling-internal/plugins/behaviour/table'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { TableNode } from '@lexical/table'
import React from 'react'

export const InklingTablePlugin = () => {
  const [editor] = useLexicalComposerContext()
  React.useEffect(() => {
    if (!editor.hasNode(TableNode)) {
      return undefined
    }
    return registerTableBehaviour(editor)
  }, [editor])

  return null
}

export default InklingTablePlugin
