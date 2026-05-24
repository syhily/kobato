import type { ReactNode } from 'react'

import { XIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { cn } from '@/ui/lib/cn'

export type PopupSize = 'sm' | 'md' | 'lg'

export interface PopupProps {
  open: boolean
  onClose: () => void
  /** Body max-width preset. Defaults to `sm` (300px / fit-content). */
  size?: PopupSize
  /**
   * Optional unique identifier surfaced as `data-popup-id` on the
   * outer container so callers that need outside-click detection can
   * disambiguate sibling popups via a `[data-popup-id="…"]` selector
   * (the click happens on the document root, so a class hook on the
   * popup element is the standard way to scope the test). Without
   * this prop the popup still renders, just without a stable hook.
   */
  popupId?: string
  /** Forwarded to the dialog container for screen reader naming. */
  'aria-label'?: string
  /** Element id whose textContent names the dialog. Takes precedence over aria-label. */
  'aria-labelledby'?: string
  children: ReactNode
}

// CSS selector matching tabbable / focusable controls. Used by the
// focus trap to find the first / last candidate inside the dialog.
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(',')

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (node) => !node.hasAttribute('inert') && node.offsetParent !== null,
  )
}

// Tailwind utility chains for the body's `max-width` ladder. `lg` is
// kept for API completeness but no consumer uses it today (only the QR
// dialog (`sm`) and header search (`md`) ship in the public bundle).
// The mobile fallback (`w-popup-mobile`) is identical across sizes
// because the responsive cap is a property of the viewport, not of
// the size preset. All three pixel values live in `tailwind.css`'s
// `--container-popup-*` block.
const BODY_SIZE_CLASS: Record<PopupSize, string> = {
  sm: 'max-w-popup-sm w-auto',
  md: 'max-w-popup-md',
  lg: 'max-w-popup-lg',
}

// Content card padding is symmetric (`1.75rem = p-7`) for md/lg, but
// the narrower 300px `sm` card opens its X axis to `2.5rem = px-10`
// so the inner content doesn't feel pinned to the chrome.
const CONTENT_SIZE_CLASS: Record<PopupSize, string> = {
  sm: 'py-7 px-10',
  md: 'p-7',
  lg: 'p-7',
}

// Floating "X" close button that sits half-overlapping the bottom of
// the popup card. Split into layout / box / colour / motion / state
// rows so the open hover / focus-visible flips read at a glance.
const popupCloseButtonClass = cn(
  'fixed bottom-0 left-1/2 z-99 flex items-center justify-center',
  '-translate-x-1/2 translate-y-1/2',
  'h-8 w-8 appearance-none rounded-full border-0 p-0',
  'bg-canvas shadow-popup-close',
  'transition-colors duration-150 ease-out',
  'hover:bg-popup-close-hover focus-visible:bg-popup-close-hover',
)

// Centered modal shell. We defer flipping on the "open" state by one
// frame so the CSS transition plays — without the rAF gate the
// browser would commit the open opacity/translate in the same paint
// as the initial mount and skip the transition entirely.
//
// Callers that need to focus a control inside the popup should call
// `ref.focus()` synchronously after `setOpen(true)` (typically wrapped
// in `flushSync` so the popup body has been mounted by then). Focus
// commits before the rAF below fires, so the input is interactive
// from the moment the user sees the dialog and the entrance
// animation still plays its full ~300ms cycle.
export function Popup({
  open,
  onClose,
  size = 'sm',
  popupId,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  children,
}: PopupProps) {
  const [entered, setEntered] = useState(false)
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) {
      setEntered(false)
      return
    }
    const raf = window.requestAnimationFrame(() => setEntered(true))
    return () => window.cancelAnimationFrame(raf)
  }, [open])

  useEffect(() => {
    if (!open) {
      return
    }
    // Save the element that opened the popup so we can restore focus on close.
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null

    // Focus the first focusable child after the dialog has rendered. We poll
    // through one rAF because the close button is fixed-positioned and only
    // becomes focusable once the entrance transition allows pointer-events.
    const raf = window.requestAnimationFrame(() => {
      const root = dialogRef.current
      if (root === null) {
        return
      }
      const focusables = getFocusable(root)
      const target = focusables[0] ?? root
      target.focus({ preventScroll: true })
    })

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab' || dialogRef.current === null) {
        return
      }
      const focusables = getFocusable(dialogRef.current)
      if (focusables.length === 0) {
        event.preventDefault()
        dialogRef.current.focus({ preventScroll: true })
        return
      }
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement
      if (event.shiftKey) {
        if (active === first || !dialogRef.current.contains(active)) {
          event.preventDefault()
          last.focus({ preventScroll: true })
        }
      } else {
        if (active === last || !dialogRef.current.contains(active)) {
          event.preventDefault()
          first.focus({ preventScroll: true })
        }
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      window.cancelAnimationFrame(raf)
      // Restore focus to whatever opened the popup so the page stays
      // navigable for keyboard / screen reader users.
      previouslyFocusedRef.current?.focus({ preventScroll: true })
    }
  }, [open, onClose])

  if (!open || typeof document === 'undefined') {
    return null
  }

  return createPortal(
    <div
      data-popup-id={popupId}
      className={cn(
        'fixed inset-0 z-1500 flex items-center justify-center overflow-x-hidden overflow-y-auto',
        entered ? 'visible opacity-100' : 'invisible opacity-0',
      )}
    >
      <div
        className={cn(
          'fixed inset-0 bg-scrim',
          entered ? 'pointer-events-auto visible opacity-100' : 'invisible opacity-0',
        )}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabelledBy === undefined ? ariaLabel : undefined}
        aria-labelledby={ariaLabelledBy}
        tabIndex={-1}
        className={cn(
          'relative w-popup-mobile py-8 transition-all duration-300 ease-in-out focus:outline-none md:w-full',
          entered ? 'pointer-events-auto visible translate-y-0 opacity-100' : 'invisible -translate-y-10 opacity-0',
          BODY_SIZE_CLASS[size],
        )}
      >
        <button
          type="button"
          aria-label="关闭"
          className={popupCloseButtonClass}
          onClick={(event) => {
            event.stopPropagation()
            onClose()
          }}
        >
          <XIcon size={22} aria-hidden className="inline-block align-middle text-ink-4" />
        </button>
        <div className={cn('relative rounded-lg bg-canvas text-ink-1', CONTENT_SIZE_CLASS[size])}>{children}</div>
      </div>
    </div>,
    document.body,
  )
}
