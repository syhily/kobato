// SSR-safe double for `@/ui/components/dialog` — the real one portals
// into document.body, which renderToStaticMarkup never runs. Only the
// exports the admin views consume are stubbed.

import type { ReactNode } from 'react'

export function Dialog({ open, children }: { open?: boolean; children?: ReactNode }) {
  return open ? <div data-slot="dialog">{children}</div> : null
}

export function DialogContent({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <div data-slot="dialog-content" className={className}>
      {children}
    </div>
  )
}

export function DialogDescription({ children }: { children?: ReactNode }) {
  return <p data-slot="dialog-description">{children}</p>
}

export function DialogFooter({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <div data-slot="dialog-footer" className={className}>
      {children}
    </div>
  )
}

export function DialogHeader({ children }: { children?: ReactNode }) {
  return <div data-slot="dialog-header">{children}</div>
}

export function DialogTitle({ children }: { children?: ReactNode }) {
  return <h2 data-slot="dialog-title">{children}</h2>
}
