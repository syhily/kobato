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
  /** Optional identifier surfaced as `data-popup-id` for outside-click detection. */
  popupId?: string
  /** Forwarded to the dialog container for screen reader naming. */
  'aria-label'?: string
  /** Element id whose textContent names the dialog. Takes precedence over aria-label. */
  'aria-labelledby'?: string
  children: ReactNode
}

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

const BODY_SIZE_CLASS: Record<PopupSize, string> = {
  sm: 'max-w-popup-sm w-auto',
  md: 'max-w-popup-md',
  lg: 'max-w-popup-lg',
}

const CONTENT_SIZE_CLASS: Record<PopupSize, string> = {
  sm: 'py-7 px-10',
  md: 'p-7',
  lg: 'p-7',
}

const popupCloseButtonClass = cn(
  'fixed bottom-0 left-1/2 z-99 flex items-center justify-center',
  '-translate-x-1/2 translate-y-1/2',
  'h-8 w-8 appearance-none rounded-full border-0 p-0',
  'bg-canvas shadow-popup-close',
  'transition-colors duration-150 ease-out',
  'hover:bg-popup-close-hover focus-visible:bg-popup-close-hover',
)

// rAF-defer the open state so CSS transition plays on mount.
// Callers that need immediate focus should call `ref.focus()` inside `flushSync`.
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
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null

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
