import { DELETE_CARD_COMMAND } from '@kobato/inkling-internal/plugins/behaviour/commands'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getNodeByKey, type NodeKey } from 'lexical'
import React from 'react'

export function useSelectorPlaceholderLifecycle(nodeKey: NodeKey) {
  const [editor] = useLexicalComposerContext()
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        editor.dispatchCommand(DELETE_CARD_COMMAND, { cardKey: nodeKey })
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [editor, nodeKey])

  const closeSelector = React.useCallback(() => {
    editor.dispatchCommand(DELETE_CARD_COMMAND, { cardKey: nodeKey })
  }, [editor, nodeKey])

  const placeholderExists = React.useCallback(() => {
    return editor.getEditorState().read(() => $getNodeByKey(nodeKey) !== null)
  }, [editor, nodeKey])

  return { closeSelector, placeholderExists }
}
