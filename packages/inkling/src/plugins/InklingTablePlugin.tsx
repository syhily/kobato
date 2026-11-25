import { registerTableBehaviour } from '@kobato/inkling-internal/plugins/behaviour/table'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { TableNode } from '@lexical/table'
import { useEffect } from 'react'
export const InklingTablePlugin = () => {
  const [editor] = useLexicalComposerContext()
  useEffect(() => {
    if (!editor.hasNode(TableNode)) {
      return undefined
    }
    return registerTableBehaviour(editor)
  }, [editor])

  return null
}

export default InklingTablePlugin
