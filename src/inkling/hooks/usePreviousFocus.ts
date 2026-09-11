import { useRef } from 'react'

interface UsePreviousFocusResult {
  handleMousedown: () => void
  handleClick: (e: React.MouseEvent) => void
}

export const usePreviousFocus = (onClick: (name?: string) => void, name?: string): UsePreviousFocusResult => {
  const previousRangeRef = useRef<Range | null>(null)

  const handleMousedown = (): void => {
    const selection = document.getSelection()
    previousRangeRef.current = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null
  }

  const handleClick = (e: React.MouseEvent): void => {
    e.preventDefault()
    onClick(name)

    if (previousRangeRef.current) {
      const selection = document.getSelection()
      selection?.removeAllRanges()
      if (selection) {
        selection.addRange(previousRangeRef.current)
      }
      previousRangeRef.current = null
    }
  }

  return { handleMousedown, handleClick }
}
