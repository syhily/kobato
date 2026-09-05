import type { HistoryState } from '@lexical/react/LexicalHistoryPlugin'

import { CAN_REDO_COMMAND, CAN_UNDO_COMMAND, type LexicalEditor } from 'lexical'

/**
 * Purges undo/redo entries owned by dead editors from a shared history state.
 *
 * Nested card editors share the top-level undo stack (SharedEditorStateContext),
 * and history entries are editor-attributed — undoing an entry applies its
 * state through `entry.editor.setEditorState` (@lexical/history). When a card
 * is deleted, its dying nested editors still emit updates (blur/selection
 * bookkeeping tagged history-merge) that can push or rewrite entries owned by
 * those nested editors onto the shared stack. The next undo then pops an
 * entry owned by an unmounted editor and silently applies it nowhere — the
 * user-visible symptom is "Cmd+Z does nothing after deleting a card" (and the
 * e2e flake in the toggle card's undo test).
 *
 * The purge runs when a card wrapper unmounts: any entry whose editor no
 * longer has a root element can never be applied visibly again, so it is
 * dropped from both stacks (in place — collab's SharedHistoryExtension may
 * hold the array references). A `current` entry owned by a dead editor is
 * re-pointed at the live editor's present state so the next undo keeps its
 * redo target. CAN_UNDO/CAN_REDO are re-dispatched to keep toolbar state
 * honest.
 */
export function purgeDeadEditorHistoryEntries(historyState: HistoryState, liveEditor: LexicalEditor) {
  const filterInPlace = (stack: HistoryState['undoStack']) => {
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i].editor.getRootElement() === null) {
        stack.splice(i, 1)
      }
    }
  }

  filterInPlace(historyState.undoStack)
  filterInPlace(historyState.redoStack)

  const current = historyState.current
  if (current !== null && current.editor.getRootElement() === null) {
    historyState.current = { editor: liveEditor, editorState: liveEditor.getEditorState() }
  }

  liveEditor.dispatchCommand(CAN_UNDO_COMMAND, historyState.undoStack.length > 0)
  liveEditor.dispatchCommand(CAN_REDO_COMMAND, historyState.redoStack.length > 0)
}
