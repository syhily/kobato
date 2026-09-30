import type { NodeKey } from 'lexical'

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getNodeByKey } from 'lexical'

import { useCardPickerStore } from '@/inkling/context/CardPickerStoreContext'
import { resolveCardPicker } from '@/inkling/nodes/cards/host-card-registry'

export interface CardPickerHandle {
  /**
   * Open the card's picker (CONTEXT.md: "pick seam") for the given node.
   * No-ops when the editor is not editable (a read-only surface never
   * originates pick requests — the picker host's mount gate alone would
   * leave the write queued until the next editable mount), when the node is
   * gone, or when its card has no registered picker (host spec `picker` or
   * a variant override) — a pickerless card keeps its placeholder static.
   */
  open: (nodeKey: NodeKey) => void
  /** Dismiss the active pick request without picking. */
  close: () => void
}

/**
 * The card component's half of the pick seam (CONTEXT.md: "pick seam"): the
 * unresolved placeholder's click and the resolved card's replace affordance
 * both call `open(nodeKey)`; the picker host plugin
 * (`@/inkling/plugins/CardPickerHostPlugin`) renders the picker registered for
 * the node's type. Dispatch is by node KEY, never the node instance — the
 * pick write resolves the latest instance inside `editor.update()` (Lexical
 * #195).
 */
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
