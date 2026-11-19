import { useCardIsSelected } from '@kobato/inkling-internal/context/CardSelectionStoreContext'
import { SELECT_CARD_COMMAND } from '@kobato/inkling-internal/plugins/behaviour/commands'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { type NodeKey } from 'lexical'
import React from 'react'

export function useReselectOnEscape(nodeKey: NodeKey): () => void {
  const [editor] = useLexicalComposerContext()
  const isSelected = useCardIsSelected(nodeKey)
  return React.useCallback(() => {
    if (!isSelected) {
      editor.dispatchCommand(SELECT_CARD_COMMAND, { cardKey: nodeKey })
    }
  }, [editor, isSelected, nodeKey])
}
