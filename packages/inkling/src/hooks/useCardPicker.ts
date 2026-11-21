import type { NodeKey } from 'lexical'

import { useCardPickerStore } from '@kobato/inkling-internal/context/CardPickerStoreContext'
import { resolveCardPicker } from '@kobato/inkling-internal/nodes/cards/host-card-registry'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getNodeByKey } from 'lexical'

export interface CardPickerHandle {
  open: (nodeKey: NodeKey) => void
  close: () => void
}

export function useCardPicker(): CardPickerHandle {
  const [editor] = useLexicalComposerContext()
  const store = useCardPickerStore()

  const open = (nodeKey: NodeKey): void => {
    if (!editor.isEditable()) {
      return
    }
    const nodeType = editor.getEditorState().read(() => $getNodeByKey(nodeKey)?.getType())
    if (nodeType === undefined) {
      return
    }
    if (resolveCardPicker(nodeType) === undefined) {
      return
    }
    store.setState({ request: { nodeKey, nodeType } })
  }

  const close = (): void => {
    store.setState({ request: null })
  }

  return { open, close }
}
