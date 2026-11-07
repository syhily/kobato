import { useMutation } from '@tanstack/react-query'
import { CheckCheckIcon, SquarePenIcon } from 'lucide-react'
import { useState } from 'react'

import type { NotificationDto, NotificationTab } from '@/shared/contracts/notifications'

import { orpcQuery } from '@/client/api/orpc-query'
import { useInvalidateNotifications, useUnreadNotificationCount } from '@/client/hooks/use-notifications'
import { onMutationError } from '@/client/lib/toast-api-error'
import { Button } from '@/ui/components/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/ui/components/sheet'
import { Tabs, TabsList, TabsTrigger } from '@/ui/components/tabs'
import { ComposeNotificationDialog } from '@/ui/shared/notifications/ComposeNotificationDialog'
import { NotificationBadge } from '@/ui/shared/notifications/NotificationBadge'
import { NotificationDetailPane } from '@/ui/shared/notifications/NotificationDetailPane'
import { NotificationListPane } from '@/ui/shared/notifications/NotificationListPane'

interface NotificationsDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Admins get the compose entry (direct + broadcast). */
  isAdmin: boolean
}

const TAB_LABELS: Array<{ value: NotificationTab; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'unread', label: '未读' },
  { value: 'direct', label: '私信' },
  { value: 'announce', label: '公告' },
]

function isNotificationTab(value: unknown): value is NotificationTab {
  return TAB_LABELS.some(({ value: tab }) => tab === value)
}

// The global right-side drawer behind every「消息通知」entry: list ↔ detail
// panes, mark-read actions, and the admin compose dialog.
export function NotificationsDrawer({ open, onOpenChange, isAdmin }: NotificationsDrawerProps) {
  const [tab, setTab] = useState<NotificationTab>('all')
  const [selected, setSelected] = useState<NotificationDto | null>(null)
  const [composeOpen, setComposeOpen] = useState(false)
  const unreadCount = useUnreadNotificationCount()
  const invalidate = useInvalidateNotifications()

  const markAllRead = useMutation(
    orpcQuery.notifications.markRead.mutationOptions({
      onSuccess: () => void invalidate(),
      onError: onMutationError('操作失败'),
    }),
  )

  const closeDrawer = (next: boolean) => {
    onOpenChange(next)
    if (!next) {
      setSelected(null)
    }
  }

  return (
    <Sheet open={open} onOpenChange={closeDrawer}>
      <SheetContent side="right" className="gap-0 p-0 sm:max-w-md">
        {selected === null ? (
          <>
            <SheetHeader className="flex-row items-center gap-2 border-b">
              <SheetTitle className="flex-1 text-base">
                消息通知
                <NotificationBadge count={unreadCount} className="ml-2" />
              </SheetTitle>
              {isAdmin ? (
                <Button variant="ghost" size="iconSm" onClick={() => setComposeOpen(true)} aria-label="写消息">
                  <SquarePenIcon className="size-4" />
                </Button>
              ) : null}
              <Button
                variant="ghost"
                size="iconSm"
                onClick={() => markAllRead.mutate({})}
                disabled={unreadCount === 0 || markAllRead.isPending}
                aria-label="全部标为已读"
              >
                <CheckCheckIcon className="size-4" />
              </Button>
            </SheetHeader>
            <div className="border-b px-4 py-2">
              <Tabs value={tab} onValueChange={(value) => isNotificationTab(value) && setTab(value)}>
                <TabsList className="w-full">
                  {TAB_LABELS.map(({ value, label }) => (
                    <TabsTrigger key={value} value={value} className="flex-1">
                      {label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>
            <NotificationListPane key={tab} tab={tab} onOpen={setSelected} />
          </>
        ) : (
          <NotificationDetailPane item={selected} onBack={() => setSelected(null)} />
        )}
      </SheetContent>
      {isAdmin ? <ComposeNotificationDialog open={composeOpen} onOpenChange={setComposeOpen} /> : null}
    </Sheet>
  )
}
