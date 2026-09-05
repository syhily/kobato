import type { HistoryState } from '@lexical/react/LexicalHistoryPlugin'
import type { SerializedEditorState } from 'lexical'

import { createEmptyHistoryState } from '@lexical/react/LexicalHistoryPlugin'
import React from 'react'

/**
 * Shared per-top-level-editor state: one undo stack and the host's onChange.
 *
 * Composition rule (previously unwritten convention):
 * - The provider wraps the **top-level** editor tree exactly once — it lives
 *   in InklingEditor, never inside InklingComposableEditor, which
 *   also renders inside nested card composers and must not re-provide.
 * - Every InklingComposableEditor instance — top-level or nested — mounts
 *   HistoryPlugin with this externalHistoryState, so nested card edits join
 *   the top-level undo stack (skipped while collab is active; yjs owns
 *   undo/redo there). An instance with no provider above it falls back to the
 *   per-consumer history state created by the hook.
 * - InklingComposableEditor's change handler routes this shared onChange
 *   through `(parentEditor || editor).getEditorState()`, so a nested editor's
 *   change serializes the full top-level document, while a per-instance
 *   onChange prop receives only that instance's state.
 */
export interface SharedEditorStateContextValue {
  historyState: HistoryState
  onChange?: (editorStateJSON: SerializedEditorState) => void
}

const Context = React.createContext<SharedEditorStateContextValue | null>(null)

export const SharedEditorStateContext = ({
  onChange,
  children,
}: {
  onChange?: (editorStateJSON: SerializedEditorState) => void
  children: React.ReactNode
}) => {
  // useState keeps the history state stable for the provider's lifetime — a
  // changing onChange identity must not reset the undo stack
  const [historyState] = React.useState(createEmptyHistoryState)
  const value = React.useMemo<SharedEditorStateContextValue>(
    () => ({ historyState, onChange }),
    [historyState, onChange],
  )

  return <Context.Provider value={value}>{children}</Context.Provider>
}

export const useSharedEditorStateContext = (): SharedEditorStateContextValue => {
  const providedValue = React.useContext(Context)
  const [fallbackHistoryState] = React.useState(createEmptyHistoryState)
  const fallbackValue = React.useMemo<SharedEditorStateContextValue>(
    () => ({ historyState: fallbackHistoryState }),
    [fallbackHistoryState],
  )

  return providedValue ?? fallbackValue
}
