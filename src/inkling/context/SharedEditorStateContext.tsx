import type { HistoryState } from '@lexical/react/LexicalHistoryPlugin'
import type { SerializedEditorState } from 'lexical'

import { createEmptyHistoryState } from '@lexical/react/LexicalHistoryPlugin'
import React from 'react'

/**
 * Shared per-top-level-editor state: one undo stack and the host's onChange.
 *
 * - The provider wraps the top-level tree exactly once (InklingEditor), never
 *   InklingComposableEditor, which also renders inside nested card composers
 *   and must not re-provide.
 * - Every composable editor, nested included, mounts HistoryPlugin with this
 *   externalHistoryState, so nested edits join the top-level undo stack
 *   (skipped under collab: yjs owns undo/redo there).
 * - The shared onChange routes through `(parentEditor || editor).getEditorState()`,
 *   so a nested change serializes the full document; a per-instance onChange
 *   prop receives only that instance's state.
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
