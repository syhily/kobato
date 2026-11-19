import React from 'react'

export interface CardMenuSessionSelection {
  removeAllRanges: () => void
  addRange: (range: Range) => void
}
interface UseCardMenuSessionOptions {
  getSelection?: () => CardMenuSessionSelection | null
}

interface CloseMenuOptions {
  resetCursor?: boolean
}

interface OpenMenuOptions {
  anchor?: Range | null
}

export function useCardMenuSession({ getSelection = () => document.getSelection() }: UseCardMenuSessionOptions = {}) {
  const [isOpen, setIsOpen] = React.useState(false)
  const cachedRange = React.useRef<Range | null>(null)
  const containerRef = React.useRef<HTMLDivElement | null>(null)

  const saveCursor = React.useCallback((range: Range | null) => {
    cachedRange.current = range
  }, [])

  const restoreCursor = React.useCallback(() => {
    if (!cachedRange.current) {
      return
    }
    const selection = getSelection()
    if (selection) {
      selection.removeAllRanges()
      selection.addRange(cachedRange.current)
    }
  }, [getSelection])

  const openMenu = React.useCallback(
    ({ anchor }: OpenMenuOptions = {}) => {
      if (anchor) {
        saveCursor(anchor)
        restoreCursor()
      }
      setIsOpen(true)
    },
    [saveCursor, restoreCursor],
  )

  const closeMenu = React.useCallback(
    ({ resetCursor = false }: CloseMenuOptions = {}) => {
      if (resetCursor) {
        restoreCursor()
      }
      setIsOpen(false)
      cachedRange.current = null
    },
    [restoreCursor],
  )

  const insert = React.useCallback(
    (doInsert: () => void) => {
      doInsert()
      closeMenu()
    },
    [closeMenu],
  )

  React.useEffect(() => {
    if (!isOpen) {
      return
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMenu({ resetCursor: true })
      }
    }

    window.addEventListener('keydown', handleEscape)
    return () => {
      window.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, closeMenu])

  React.useEffect(() => {
    if (!isOpen) {
      return
    }

    const handleMousedown = (event: MouseEvent) => {
      if (event.target instanceof Node && containerRef.current?.contains(event.target)) {
        return
      }
      closeMenu()
    }

    window.addEventListener('mousedown', handleMousedown)
    return () => {
      window.removeEventListener('mousedown', handleMousedown)
    }
  }, [isOpen, closeMenu])

  return {
    containerRef,
    isOpen,
    openMenu,
    closeMenu,
    insert,
    saveCursor,
  }
}

export type CardMenuSession = ReturnType<typeof useCardMenuSession>
