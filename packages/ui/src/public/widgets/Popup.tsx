import type { ReactNode } from 'react'

import { transitions } from '@kobato/client/lib/motion'
import { LazyAnimatePresence, LazyMotionButton, LazyMotionDiv } from '@kobato/ui/components/lazy-motion'
import { cn } from '@kobato/ui/lib/cn'
import { XIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export type PopupSize = 'sm' | 'md' | 'lg'

export interface PopupProps {
  open: boolean
  onClose: () => void
  /** Body max-width preset. Defaults to `sm` (300px / fit-content). */
  size?: PopupSize
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

const backdropVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
}

const contentVariants = {
  hidden: { opacity: 0, y: 30, scale: 0.92 },
  visible: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: 20, scale: 0.96 },
}

const closeButtonVariants = {
  hidden: { scale: 0, opacity: 0 },
  visible: { scale: 1, opacity: 1 },
}

export function Popup({
  open,
  onClose,
  size = 'sm',
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  children,
}: PopupProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const portalRef = useRef<HTMLDivElement | null>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)
  const [mounted, setMounted] = useState(open)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    setMounted(open)
  }

  useEffect(() => {
    if (!open || !mounted) {
      return
    }
    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null

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

    const portal = portalRef.current
    const inerted: Element[] = []
    if (portal) {
      Array.from(document.body.children).forEach((child) => {
        if (child !== portal) {
          child.setAttribute('inert', '')
          inerted.push(child)
        }
      })
    }

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      window.cancelAnimationFrame(raf)
      inerted.forEach((child) => child.removeAttribute('inert'))
      previouslyFocusedRef.current?.focus({ preventScroll: true })
    }
  }, [open, mounted, onClose])

  if (typeof document === 'undefined') {
    return null
  }

  return createPortal(
    <LazyAnimatePresence>
      {open && mounted && (
        <LazyMotionDiv
          key="popup-wrapper"
          ref={portalRef}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={transitions.popupFade}
          className="fixed inset-0 z-1500 flex items-center justify-center overflow-x-hidden overflow-y-auto"
        >
          <LazyMotionDiv
            key="popup-backdrop"
            variants={backdropVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            transition={transitions.popupFade}
            className="fixed inset-0 bg-scrim/80 backdrop-blur-sm"
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
              'relative w-popup-mobile translate-y-0 py-8 focus:outline-none md:w-full',
              BODY_SIZE_CLASS[size],
            )}
          >
            <LazyMotionDiv
              key="popup-content"
              variants={contentVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              transition={transitions.popup}
            >
              <div className={cn('relative rounded-lg bg-canvas text-ink-1', CONTENT_SIZE_CLASS[size])}>{children}</div>
            </LazyMotionDiv>
            <LazyMotionButton
              key="popup-close"
              type="button"
              aria-label="关闭"
              variants={closeButtonVariants}
              initial="hidden"
              animate="visible"
              exit="hidden"
              transition={{ ...transitions.popup, delay: 0.1 }}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              className={cn(
                'fixed bottom-0 left-1/2 z-99 flex items-center justify-center',
                '-translate-x-1/2 translate-y-1/2',
                'h-8 w-8 appearance-none rounded-full border-0 p-0',
                'bg-canvas shadow-popup-close',
                'transition-colors duration-150 ease-out',
                'hover:bg-popup-close-hover focus-visible:bg-popup-close-hover',
              )}
              onClick={(event) => {
                event.stopPropagation()
                onClose()
              }}
            >
              <XIcon size={22} aria-hidden className="inline-block align-middle text-ink-4" />
            </LazyMotionButton>
          </div>
        </LazyMotionDiv>
      )}
    </LazyAnimatePresence>,
    document.body,
  )
}
