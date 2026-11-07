import { Suspense, lazy, useState } from 'react'

interface LazyNotificationsDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Admins get the compose entry (direct + broadcast). */
  isAdmin: boolean
  /** Owned by the shell (one observer per shell) — the drawer never subscribes.
   *  `null` = unknown (not loaded / failed), distinct from a confirmed `0`. */
  unreadCount: number | null
}

const NotificationsDrawer = lazy(() =>
  import('@/ui/shared/notifications/NotificationsDrawer').then((module) => ({ default: module.NotificationsDrawer })),
)

/** Hover-intent prefetch; the browser dedupes this against the lazy boundary's own import. */
export const warmNotificationsDrawerChunk = () => void import('@/ui/shared/notifications/NotificationsDrawer')

// Interaction-gated mount for the drawer chain (sheet, panes, compose): the
// public Header statically imports the user menu, so a static drawer import
// would ship the whole chain to every anonymous visitor. Renders null —
// byte-stable between SSR and hydration — until the first open, then stays
// mounted so drawer state survives close/reopen. The "latch on first true"
// state is adjusted DURING render (React re-renders before committing), not
// in an effect — see react.dev's "adjusting state during render".
export function LazyNotificationsDrawer({ open, ...rest }: LazyNotificationsDrawerProps) {
  const [everOpened, setEverOpened] = useState(open)
  if (open && !everOpened) {
    setEverOpened(true)
  }
  if (!everOpened) {
    return null
  }
  return (
    <Suspense fallback={null}>
      <NotificationsDrawer open={open} {...rest} />
    </Suspense>
  )
}
