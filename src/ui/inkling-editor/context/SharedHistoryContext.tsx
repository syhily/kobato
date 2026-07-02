import type { HistoryState } from '@lexical/react/LexicalHistoryPlugin'

import { createEmptyHistoryState } from '@lexical/react/LexicalHistoryPlugin'
import React from 'react'

export interface SharedHistoryContextValue {
  historyState: HistoryState
}

const Context = React.createContext<SharedHistoryContextValue>({ historyState: createEmptyHistoryState() })

export const SharedHistoryContext = ({ children }: { children: React.ReactNode }) => {
  const historyContext = React.useMemo<SharedHistoryContextValue>(
    () => ({ historyState: createEmptyHistoryState() }),
    [],
  )

  return <Context.Provider value={historyContext}>{children}</Context.Provider>
}

export const useSharedHistoryContext = () => React.useContext(Context)
