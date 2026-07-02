import React from 'react'

export interface InklingSelectedCardContextValue {
  selectedCardKey: string | null
  setSelectedCardKey: React.Dispatch<React.SetStateAction<string | null>>
  isEditingCard: boolean
  setIsEditingCard: React.Dispatch<React.SetStateAction<boolean>>
  isDragging: boolean
  setIsDragging: React.Dispatch<React.SetStateAction<boolean>>
  showVisibilitySettings: boolean
  setShowVisibilitySettings: React.Dispatch<React.SetStateAction<boolean>>
}

const Context = React.createContext<InklingSelectedCardContextValue>({
  selectedCardKey: null,
  setSelectedCardKey: () => {},
  isEditingCard: false,
  setIsEditingCard: () => {},
  isDragging: false,
  setIsDragging: () => {},
  showVisibilitySettings: false,
  setShowVisibilitySettings: () => {},
})

export const InklingSelectedCardContext = ({ children }: { children: React.ReactNode }) => {
  const [selectedCardKey, setSelectedCardKey] = React.useState<string | null>(null)
  const [isEditingCard, setIsEditingCard] = React.useState<boolean>(false)
  const [isDragging, setIsDragging] = React.useState<boolean>(false)
  const [showVisibilitySettings, setShowVisibilitySettings] = React.useState<boolean>(false)
  const contextValue = React.useMemo<InklingSelectedCardContextValue>(() => {
    return {
      selectedCardKey,
      setSelectedCardKey,
      isEditingCard,
      setIsEditingCard,
      isDragging,
      setIsDragging,
      showVisibilitySettings,
      setShowVisibilitySettings,
    }
  }, [
    selectedCardKey,
    setSelectedCardKey,
    isEditingCard,
    setIsEditingCard,
    isDragging,
    setIsDragging,
    showVisibilitySettings,
    setShowVisibilitySettings,
  ])

  return <Context.Provider value={contextValue}>{children}</Context.Provider>
}

export const useInklingSelectedCardContext = () => React.useContext(Context)
