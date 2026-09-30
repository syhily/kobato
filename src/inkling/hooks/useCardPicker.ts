import type { NodeKey } from 'lexical'

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getNodeByKey } from 'lexical'

import { useCardPickerStore } from '@/inkling/context/CardPickerStoreContext'
import { resolveCardFacts } from '@/inkling/nodes/cards/card-facts'

export interface CardPickerHandle {
  /**
   * Open the card's picker (CONTEXT.md: "pick seam") for the given node.
   * No-ops when the node is gone or its card declares no picker — a card
   * without a picker spec keeps its placeholder static.
   */
  open: (nodeKey: NodeKey) => void
  /** Dismiss the active pick request without picking. */
  close: () => void
}

/**
 * The card component's half of the pick seam (CONTEXT.md: "pick seam"): the
 * unresolved placeholder's click and the resolved card's replace affordance
 * both call `open(nodeKey)`; the picker host plugin
 * (`@/inkling/plugins/CardPickerHostPlugin`) renders the picker spec the card
 * declared on `defineCard`. Dispatch is by node KEY, never the node instance
 * — the pick write resolves the latest instance inside `editor.update()`
 * (Lexical #195).
 */
export function useCardPicker(): CardPickerHandle {
  const [editor] = useLexicalComposerContext()
  const store = useCardPickerStore()

  const open = (nodeKey: NodeKey): void => {
    const nodeType = editor.getEditorState().read(() => $getNodeByKey(nodeKey)?.getType())
    if (nodeType === undefined) {
      return
    }
    const facts = resolveCardFacts(nodeType)
    if (facts?.source !== 'host' || facts.host.spec.picker === undefined) {
      return
    }
    store.setState({ request: { nodeKey, nodeType } })
  }

  const close = (): void => {
    store.setState({ request: null })
  }

  return { open, close }
}
