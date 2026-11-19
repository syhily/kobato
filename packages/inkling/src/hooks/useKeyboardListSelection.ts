import React from 'react'

export interface UseKeyboardListSelectionOptions<T> {
  items: T[]
  onSelect: (item: T) => void
  defaultSelected?: T
  onEnterWithoutSelection?: () => void
}

export interface KeyboardListSelection {
  selectedIndex: number
  scrollSelectedIntoView: boolean

  hoverIndex: (index: number) => void
}

export function useKeyboardListSelection<T>({
  items,
  onSelect,
  defaultSelected,
  onEnterWithoutSelection,
}: UseKeyboardListSelectionOptions<T>): KeyboardListSelection {
  const defaultIndex = Math.max(
    0,
    items.findIndex((item) => item === defaultSelected),
  )
  const [selectedIndex, setSelectedIndex] = React.useState(defaultIndex)
  const [scrollSelectedIntoView, setScrollSelectedIntoView] = React.useState(false)
  const [hasNavigated, setHasNavigated] = React.useState(false)

  // Adjust the selection during render (React discards this render's output
  // and re-renders immediately): re-select the default and reset navigation
  // state when the default changes, clamp the index when the items shrink
  const [prevDefaultIndex, setPrevDefaultIndex] = React.useState(defaultIndex)
  if (prevDefaultIndex !== defaultIndex) {
    setPrevDefaultIndex(defaultIndex)
    setSelectedIndex(defaultIndex)
    setHasNavigated(false)
  } else if (selectedIndex >= items.length && selectedIndex !== defaultIndex) {
    setSelectedIndex(defaultIndex)
  }

  const handleKeydown = React.useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'ArrowDown') {
        // The stop propagation is required for Safari
        event.preventDefault()
        event.stopPropagation()
        setHasNavigated(true)
        setSelectedIndex((i) => {
          return Math.max(0, Math.min(i + 1, items.length - 1))
        })
        setScrollSelectedIntoView(true)
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        event.stopPropagation()
        setHasNavigated(true)
        setSelectedIndex((i) => {
          return Math.max(i - 1, 0)
        })
        setScrollSelectedIntoView(true)
      }
      if (event.key === 'Enter') {
        // an explicit index check, not truthiness — a falsy item (''/0/false)
        // is still a valid selection
        const hasSelection = selectedIndex < items.length
        if (!hasSelection && !onEnterWithoutSelection) {
          return
        }

        // When the link input is focused and the user hasn't explicitly navigated
        // the suggestion list, let the input's own Enter handler submit the typed
        // URL instead of selecting the default suggestion.
        const target = event.target
        if (!hasNavigated && target instanceof HTMLInputElement && target.dataset.inklingLinkInput !== undefined) {
          return
        }

        event.preventDefault()
        event.stopPropagation()

        if (hasSelection) {
          onSelect(items[selectedIndex])
        } else {
          onEnterWithoutSelection?.()
        }
      }
    },
    [items, selectedIndex, onSelect, onEnterWithoutSelection, hasNavigated],
  )

  React.useEffect(() => {
    // The capture phase is required for Safari
    window.addEventListener('keydown', handleKeydown, { capture: true })
    return () => {
      window.removeEventListener('keydown', handleKeydown, { capture: true })
    }
  }, [handleKeydown])

  return {
    selectedIndex,
    scrollSelectedIntoView,
    hoverIndex(index: number) {
      setSelectedIndex(index)
      setScrollSelectedIntoView(false)
    },
  }
}
