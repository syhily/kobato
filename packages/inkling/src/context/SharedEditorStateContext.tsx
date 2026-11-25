import type { HistoryState } from '@lexical/react/LexicalHistoryPlugin'
import type { SerializedEditorState } from 'lexical'

import { createEmptyHistoryState } from '@lexical/react/LexicalHistoryPlugin'
import { type ReactNode, createContext, useContext, useMemo, useState } from 'react'
export interface SharedEditorStateContextValue {
  historyState: HistoryState
  onChange?: (editorStateJSON: SerializedEditorState) => void
}

const Context = createContext<SharedEditorStateContextValue | null>(null)

export const SharedEditorStateContext = ({
  onChange,
  children,
}: {
  onChange?: (editorStateJSON: SerializedEditorState) => void
  children: ReactNode
}) => {
  const [historyState] = useState(createEmptyHistoryState)
  const value = useMemo<SharedEditorStateContextValue>(() => ({ historyState, onChange }), [historyState, onChange])

  return <Context.Provider value={value}>{children}</Context.Provider>
}

export const useSharedEditorStateContext = (): SharedEditorStateContextValue => {
  const providedValue = useContext(Context)
  const [fallbackHistoryState] = useState(createEmptyHistoryState)
  const fallbackValue = useMemo<SharedEditorStateContextValue>(
    () => ({ historyState: fallbackHistoryState }),
    [fallbackHistoryState],
  )

  return providedValue ?? fallbackValue
}
