import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

/**
 * Global card-selection state — ported from Koenig's
 * KoenigSelectedCardContext.
 *
 * Unlike Lexical's NodeSelection (which lives in the editor state tree and
 * can hold multiple nodes), this React context tracks a SINGLE selected card
 * plus whether it's in edit mode and whether a drag is in progress. This is
 * the UI source of truth that KoenigCardWrapper reads to derive
 * `isSelected` / `isEditing`.
 *
 * `showVisibilitySettings` from Koenig is omitted.
 */
export interface KoenigSelectedCardContextValue {
  selectedCardKey: string | null
  setSelectedCardKey: (key: string | null) => void
  isEditingCard: boolean
  setIsEditingCard: (editing: boolean) => void
  isDragging: boolean
  setIsDragging: (dragging: boolean) => void
}

const Context = createContext<KoenigSelectedCardContextValue>({
  selectedCardKey: null,
  setSelectedCardKey: () => undefined,
  isEditingCard: false,
  setIsEditingCard: () => undefined,
  isDragging: false,
  setIsDragging: () => undefined,
})

export function KoenigSelectedCardContextProvider({ children }: { children: ReactNode }) {
  const [selectedCardKey, setSelectedCardKey] = useState<string | null>(null)
  const [isEditingCard, setIsEditingCard] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  const value = useMemo<KoenigSelectedCardContextValue>(
    () => ({
      selectedCardKey,
      setSelectedCardKey,
      isEditingCard,
      setIsEditingCard,
      isDragging,
      setIsDragging,
    }),
    [selectedCardKey, isEditingCard, isDragging],
  )

  return <Context.Provider value={value}>{children}</Context.Provider>
}

export function useKoenigSelectedCardContext(): KoenigSelectedCardContextValue {
  return useContext(Context)
}
