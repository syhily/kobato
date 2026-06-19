import type { HistoryState } from '@lexical/history'
import type { ReactNode } from 'react'

import { createEmptyHistoryState } from '@lexical/history'
import { createContext, useContext, useMemo } from 'react'

const SharedHistoryContext = createContext<HistoryState | null>(null)

export interface SharedHistoryProviderProps {
  children: ReactNode
}

/** Provide a single shared HistoryState so nested editors (Solution/TwoColumn)
 *  share undo/redo with the root editor. Mirrors Koenig's SharedHistoryContext. */
export function SharedHistoryProvider({ children }: SharedHistoryProviderProps) {
  const historyState = useMemo(() => createEmptyHistoryState(), [])
  return <SharedHistoryContext.Provider value={historyState}>{children}</SharedHistoryContext.Provider>
}

export function useSharedHistoryState(): HistoryState {
  const state = useContext(SharedHistoryContext)
  if (state === null) {
    throw new Error('useSharedHistoryState must be used inside <SharedHistoryProvider>')
  }
  return state
}
