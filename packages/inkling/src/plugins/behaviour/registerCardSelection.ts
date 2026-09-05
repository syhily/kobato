import type { EditorState, LexicalEditor } from 'lexical'

import { $getNodeByKey, $getSelection, $isNodeSelection } from 'lexical'

import { $isInklingCard } from '@/nodes/base'

import type { CardSelectionStore } from './cardSelectionStore'

import { $deselectCard } from './card-adjacency'

interface CardSelectionDeps {
  store: CardSelectionStore
  isNested?: boolean
}

export function registerCardSelection(editor: LexicalEditor, deps: CardSelectionDeps) {
  const { store, isNested } = deps

  // Track card selections restored by undo/redo so we can protect them from
  // being cleared by decorator reconciliation side-effects. When a 'historic'
  // update restores a NodeSelection, subsequent Lexical updates triggered by
  // React rendering the decorator component can momentarily change the
  // selection, causing the card to appear deselected. The restore is guarded
  // for a short window instead of a single clearing cycle: under load the
  // reconciliation can produce several transient deselections in a row, and
  // a one-shot ref would release on the first and let a later one win.
  // The ref is released by a stable update confirming the card selection, or
  // when the window elapses — a real user click that late is a legitimate
  // deselect, not a reconciliation side-effect. The confirm is itself gated
  // on a short grace period: the reconciliation right after a historic
  // restore can carry untagged updates WITH the card selected (intermediate
  // states), and releasing on one of those would drop the protection before
  // the transient deselections arrive.
  const PRESERVE_SELECTION_WINDOW_MS = 1000
  const PRESERVE_CONFIRM_GRACE_MS = 200
  let preserveCardSelection: { key: string; until: number; setAt: number } | null = null

  return editor.registerUpdateListener(({ editorState, tags }: { editorState: EditorState; tags: Set<string> }) => {
    // ignore updates triggered by other users or by card node exportJSON calls
    if (tags.has('collaboration') || tags.has('card-export')) {
      return
    }

    // ignore selections inside of nested editors otherwise we'll
    // mistakenly deselect the card containing the nested editor
    if (isNested || document.activeElement?.closest('[data-lexical-decorator]')) {
      return
    }

    // read the store fresh on every update — a synchronous read is never
    // staler than the React mirror it replaced
    const { selectedCardKey } = store.getState()

    // trigger card selection/deselection when selection changes
    const { isCardSelected, cardKey, cardNode } = editorState.read(() => {
      const selection = $getSelection()

      const selectedNode =
        $isNodeSelection(selection) && selection.getNodes().length === 1 ? selection.getNodes()[0] : null

      if (selectedNode && $isInklingCard(selectedNode)) {
        return { isCardSelected: true, cardKey: selectedNode.getKey(), cardNode: selectedNode }
      } else {
        return { isCardSelected: false }
      }
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
        ) // don't include a history entry for selection change
      }
    }

    // When undo/redo restores a card selection, protect it from
    // being cleared by side-effects of decorator reconciliation
    if (tags.has('historic') && isCardSelected && cardKey) {
      const now = performance.now()
      preserveCardSelection = { key: cardKey, until: now + PRESERVE_SELECTION_WINDOW_MS, setAt: now }
    }

    // If a non-historic, non-history-merge update arrives with the
    // card still selected, reconciliation succeeded without a
    // transient deselection so the ref is no longer needed -
    // clear it to avoid blocking future legitimate deselections.
    // history-merge updates are excluded because they fire as
    // internal bookkeeping before decorator reconciliation, and the
    // grace period keeps the reconciliation's own intermediate
    // untagged updates (which may still carry the selection) from
    // releasing the ref before the transient deselections land.
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
      // The selection was just restored by undo/redo; the deselection is a
      // transient side-effect of decorator re-rendering, not a user action.
      // The store is the behavioural truth (dispatchSelectedCardDeletion and
      // the card chrome read it), so it is KEPT — without re-issuing the
      // selection: a re-select update re-triggers the very reconciliation
      // that produced the transient deselect, feeding a self-sustaining
      // cycle that can outlive the window. The no-op change guard swallows
      // the write when nothing changed, so this never re-renders. The ref
      // survives repeated transient deselections and is released by a
      // stable confirm or the window expiry below, so a legitimate deselect
      // after the window is not blocked.
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
        // the protection window elapsed — from here on deselections are real
        preserveCardSelection = null
      }

      editor.update(
        () => {
          $deselectCard(editor, selectedCardKey)

          store.setState({ selectedCardKey: null, isEditingCard: false })
        },
        { tag: 'history-merge' },
      ) // don't include a history entry for selection change
    }

    // we have special-case cards that are inserted via markdown
    // expansions where we can't use editor commands to open in
    // edit mode so we handle that here instead. The transient flag exists
    // only on the codeblock card — the `in` checks are the discriminator.
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
