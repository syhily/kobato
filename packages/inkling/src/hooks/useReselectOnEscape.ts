import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { type NodeKey } from 'lexical'
import React from 'react'

import { useCardIsSelected } from '@/context/CardSelectionStoreContext'
import { SELECT_CARD_COMMAND } from '@/plugins/behaviour/commands'

/**
 * The shared `onEscape` handler for editing-capable cards (code block, math):
 * re-select only fires when the card lost its selection; escape-while-editing
 * is a no-op.
 */
export function useReselectOnEscape(nodeKey: NodeKey): () => void {
  const [editor] = useLexicalComposerContext()
  const isSelected = useCardIsSelected(nodeKey)

  return React.useCallback(() => {
    if (!isSelected) {
      editor.dispatchCommand(SELECT_CARD_COMMAND, { cardKey: nodeKey })
    }
  }, [editor, isSelected, nodeKey])
}
