import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { TableNode } from '@lexical/table'
import React from 'react'

import { registerTableBehaviour } from '@/plugins/behaviour/table'

/**
 * React adapter for the table behaviour (`@/plugins/behaviour/table`),
 * mounted by DefaultFeaturePlugins. No-ops on surfaces whose node set left
 * the table family out — the selection observer invariants on an
 * unregistered TableNode.
 */
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
