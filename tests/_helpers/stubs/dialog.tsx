// SSR-safe double for `@/ui/components/dialog`. The real dialog is a Base UI
// portal that mounts its content into `document.body`, which
// `renderToStaticMarkup` never runs — under SSR the portal renders nothing,
// so snapshot suites swap in these static stand-ins that render their
// children inline with the same `data-slot` hooks the real components emit.
//
// Usage in a test file:
//
//   vi.mock('@/ui/components/dialog', () => import('#/_helpers/stubs/dialog'))
//
// Only the exports the admin views consume are stubbed; the real module also
// exports DialogTrigger / DialogClose / DialogPortal / DialogBackdrop, which
// no snapshot suite renders.

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
