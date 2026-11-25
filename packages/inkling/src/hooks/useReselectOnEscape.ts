import { useCardIsSelected } from '@kobato/inkling-internal/context/CardSelectionStoreContext'
import { SELECT_CARD_COMMAND } from '@kobato/inkling-internal/plugins/behaviour/commands'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { type NodeKey } from 'lexical'
import { useCallback } from 'react'
export function useReselectOnEscape(nodeKey: NodeKey): () => void {
  const [editor] = useLexicalComposerContext()
  const isSelected = useCardIsSelected(nodeKey)
  return useCallback(() => {
    if (!isSelected) {
      editor.dispatchCommand(SELECT_CARD_COMMAND, { cardKey: nodeKey })
    }
  }, [editor, isSelected, nodeKey])
}
