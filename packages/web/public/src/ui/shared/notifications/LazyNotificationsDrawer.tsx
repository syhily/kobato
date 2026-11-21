import { Suspense, lazy, useState } from 'react'

interface LazyNotificationsDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  isAdmin: boolean
  unreadCount: number | null
}

const NotificationsDrawer = lazy(() =>
  import('@kobato/web-public/ui/shared/notifications/NotificationsDrawer').then((module) => ({
    default: module.NotificationsDrawer,
  })),
)

export const warmNotificationsDrawerChunk = () =>
  void import('@kobato/web-public/ui/shared/notifications/NotificationsDrawer')

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
