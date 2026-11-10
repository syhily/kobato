import type { EditorState, LexicalEditor } from 'lexical'

import { $getNodeByKey, $getSelection, $isNodeSelection } from 'lexical'

import type { CardSelectionStore } from '@/inkling/plugins/behaviour/cardSelectionStore'

import { $isInklingCard } from '@/inkling/nodes/base'
import { $deselectCard } from '@/inkling/plugins/behaviour/card-adjacency'

interface CardSelectionDeps {
  store: CardSelectionStore
  isNested?: boolean
}

export function registerCardSelection(editor: LexicalEditor, deps: CardSelectionDeps) {
  const { store, isNested } = deps

  // Track card selections restored by undo/redo so decorator reconciliation
  // side-effects cannot clear them. React re-rendering the decorator can change the
  // selection transiently, several times in a row under load, so the protection is a
  // window rather than a one-shot ref. It is released by a stable update confirming
  // the card selection (after a grace period, because the reconciliation's own
  // intermediate untagged updates can still carry the selection) or when the window
  // elapses — a real click that late is a legitimate deselect.
  const PRESERVE_SELECTION_WINDOW_MS = 1000
  const PRESERVE_CONFIRM_GRACE_MS = 200
  let preserveCardSelection: { key: string; until: number; setAt: number } | null = null

  return editor.registerUpdateListener(({ editorState, tags }: { editorState: EditorState; tags: Set<string> }) => {
    // Ignore updates from other users or from card node exportJSON calls.
    if (tags.has('collaboration') || tags.has('card-export')) {
      return
    }

    // Ignore selections inside nested editors, which would deselect the containing card.
    if (isNested || document.activeElement?.closest('[data-lexical-decorator]')) {
      return
    }

    // Read the store fresh on every update rather than a React mirror.
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

    // An undo/redo restore arms the protection window.
    if (tags.has('historic') && isCardSelected && cardKey) {
      const now = performance.now()
      preserveCardSelection = { key: cardKey, until: now + PRESERVE_SELECTION_WINDOW_MS, setAt: now }
    }

    // A non-historic, non-history-merge update that still carries the card selection is
    // a stable confirm; the grace period keeps the reconciliation's own intermediate
    // untagged updates from releasing the window before the deselections land.
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
      // Inside the window the deselection is a transient decorator re-render, not a user
      // action: keep the store value (the behavioural truth for
      // dispatchSelectedCardDeletion and the card chrome) WITHOUT re-issuing the
      // selection — a re-select update re-triggers the reconciliation that produced the
      // deselect, a self-sustaining cycle that can outlive the window.
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
        // The window elapsed — from here on deselections are real.
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

    // Cards inserted by markdown expansion cannot open in edit mode through editor
    // commands. The transient flag exists only on the codeblock card; the `in` checks
    // are the discriminator.
    const openInEditMode = cardNode && '__openInEditMode' in cardNode ? cardNode.__openInEditMode : undefined
    const clearOpenInEditMode = cardNode && 'clearOpenInEditMode' in cardNode ? cardNode.clearOpenInEditMode : undefined
    if (isCardSelected && openInEditMode === true && typeof clearOpenInEditMode === 'function') {
      editor.update(
        () => {
          clearOpenInEditMode.call(cardNode)
        },
        { tag: 'history-merge' },
      ) // don't include a history entry for clearing the open in edit mode prop

      store.setState({ isEditingCard: true })
    }
  })
}
