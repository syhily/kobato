import type { CardSelectionStore } from '@kobato/inkling-internal/plugins/behaviour/card-selection-store'
import type { EditorState, LexicalEditor } from 'lexical'

import { $isInklingCard } from '@kobato/inkling-internal/nodes/base'
import { $deselectCard } from '@kobato/inkling-internal/plugins/behaviour/card-adjacency'
import { $getNodeByKey, $getSelection, $isNodeSelection } from 'lexical'

interface CardSelectionDeps {
  store: CardSelectionStore
  isNested?: boolean
}

export function registerCardSelection(editor: LexicalEditor, deps: CardSelectionDeps) {
  const { store, isNested } = deps

  const PRESERVE_SELECTION_WINDOW_MS = 1000
  const PRESERVE_CONFIRM_GRACE_MS = 200
  let preserveCardSelection: { key: string; until: number; setAt: number } | null = null

  return editor.registerUpdateListener(({ editorState, tags }: { editorState: EditorState; tags: Set<string> }) => {
    if (tags.has('collaboration') || tags.has('card-export')) {
      return
    }

    if (isNested || document.activeElement?.closest('[data-lexical-decorator]')) {
      return
    }

    const { selectedCardKey } = store.getState()

    const { isCardSelected, cardKey, cardNode } = editorState.read(() => {
      const selection = $getSelection()

      const selectedNode =
        $isNodeSelection(selection) && selection.getNodes().length === 1 ? selection.getNodes()[0] : null

      if (selectedNode && $isInklingCard(selectedNode)) {
        return { isCardSelected: true, cardKey: selectedNode.getKey(), cardNode: selectedNode }
      }
      return { isCardSelected: false }
    })

    if (isCardSelected && cardKey) {
      if (!selectedCardKey) {
        store.setState({ selectedCardKey: cardKey, isEditingCard: false })
      } else if (selectedCardKey !== cardKey) {
        editor.update(
          () => {
            $deselectCard(editor, selectedCardKey)

            store.setState({ selectedCardKey: cardKey, isEditingCard: false })
          },
          { tag: 'history-merge' },
        )
      }
    }

    if (tags.has('historic') && isCardSelected && cardKey) {
      const now = performance.now()
      preserveCardSelection = { key: cardKey, until: now + PRESERVE_SELECTION_WINDOW_MS, setAt: now }
    }

    if (
      !tags.has('historic') &&
      !tags.has('history-merge') &&
      isCardSelected &&
      preserveCardSelection?.key === cardKey &&
      performance.now() >= (preserveCardSelection?.setAt ?? 0) + PRESERVE_CONFIRM_GRACE_MS
    ) {
      preserveCardSelection = null
    }

    if (!isCardSelected && selectedCardKey) {
      const preserved =
        preserveCardSelection?.key === selectedCardKey && performance.now() < preserveCardSelection.until
      if (preserved) {
        const nodeExists = editorState.read(() => $getNodeByKey(selectedCardKey) !== null)
        if (nodeExists) {
          store.setState({ selectedCardKey: selectedCardKey, isEditingCard: false })
        } else {
          store.setState({ selectedCardKey: null, isEditingCard: false })
          preserveCardSelection = null
        }
        return
      }
      if (preserveCardSelection?.key === selectedCardKey) {
        preserveCardSelection = null
      }

      editor.update(
        () => {
          $deselectCard(editor, selectedCardKey)

          store.setState({ selectedCardKey: null, isEditingCard: false })
        },
        { tag: 'history-merge' },
      )
    }

    const openInEditMode = cardNode && '__openInEditMode' in cardNode ? cardNode.__openInEditMode : undefined
    const clearOpenInEditMode = cardNode && 'clearOpenInEditMode' in cardNode ? cardNode.clearOpenInEditMode : undefined
    if (isCardSelected && openInEditMode === true && typeof clearOpenInEditMode === 'function') {
      editor.update(
        () => {
          clearOpenInEditMode.call(cardNode)
        },
        { tag: 'history-merge' },
      )

      store.setState({ isEditingCard: true })
    }
  })
}
