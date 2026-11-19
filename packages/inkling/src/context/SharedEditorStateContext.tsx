import type { HistoryState } from '@lexical/react/LexicalHistoryPlugin'
import type { SerializedEditorState } from 'lexical'

import { createEmptyHistoryState } from '@lexical/react/LexicalHistoryPlugin'
import React from 'react'

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
