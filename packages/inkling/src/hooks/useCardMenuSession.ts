import React from 'react'

// Card-menu session — the one owner of the popup-session behaviour the slash
// and plus card menus used to re-implement each: the cursor lease (a cached
// native Range saved while the menu is open, restored on demand), the close
// policy (Escape closes and restores the cursor because it always blurs the
// contenteditable; outside mousedown and other closes leave the cursor where
// the user put it), and insert-and-close. The lease has exactly one holder —
// this module: the slash menu's cursor arrives through saveCursor (the slash
// trigger binding leases each verdict's range), the plus menu's button anchor
// is handed over at open (openMenu({ anchor }) leases it and puts the caret
// back on it) — no plugin holds a Range of its own. The native Selection
// arrives through an injected adapter so the close policy is unit-testable
// without a plugin mount. The slash trigger state (query, commandParams)
// lives in the slash trigger binding (@/hooks/useSlashCardMenuTrigger); the
// whole stack is composed by CardMenuPopup (@/plugins/CardMenuPopup).

export interface CardMenuSessionSelection {
  removeAllRanges: () => void
  addRange: (range: Range) => void
}

interface UseCardMenuSessionOptions {
  /** Native selection adapter; defaults to document.getSelection(). */
  getSelection?: () => CardMenuSessionSelection | null
}

interface CloseMenuOptions {
  /** Restore the cached cursor range before closing (Escape). */
  resetCursor?: boolean
}

interface OpenMenuOptions {
  /** Lease this range as the cursor and restore the caret onto it while
   * opening (the plus button's anchor). Omit to open without touching the
   * cursor (the slash keypress — its range arrives via saveCursor). */
  anchor?: Range | null
}

export function useCardMenuSession({ getSelection = () => document.getSelection() }: UseCardMenuSessionOptions = {}) {
  const [isOpen, setIsOpen] = React.useState(false)
  const cachedRange = React.useRef<Range | null>(null)
  const containerRef = React.useRef<HTMLDivElement | null>(null)

  /** Cache the cursor position the menu may later restore (the cursor lease). */
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
      // an anchored open leases the anchor and puts the caret back on it
      // before the menu mounts — the single-lease entry point for triggers
      // whose cursor is not the live selection (the plus button's)
      if (anchor) {
        saveCursor(anchor)
        restoreCursor()
      }
      setIsOpen(true)
    },
    [saveCursor, restoreCursor],
  )

  // Closing releases the cursor lease: resetCursor restores first (Escape),
  // every other close leaves the cursor where the user put it.
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

  /** Insert-then-close: run the insertion, then close with the default policy. */
  const insert = React.useCallback(
    (doInsert: () => void) => {
      doInsert()
      closeMenu()
    },
    [closeMenu],
  )

  // Escape closes and restores the cursor — it always blurs the
  // contenteditable, which the menu never wants.
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

  // clicks outside the menu close it (without touching the cursor)
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
