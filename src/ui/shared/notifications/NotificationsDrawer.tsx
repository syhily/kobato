import { useMutation } from '@tanstack/react-query'
import { CheckCheckIcon, SquarePenIcon } from 'lucide-react'
import { useState } from 'react'

import type { NotificationDto, NotificationTab } from '@/shared/contracts/notifications'

import { orpcQuery } from '@/client/api/orpc-query'
import { useInvalidateNotifications, usePatchNotificationReadState } from '@/client/hooks/use-notifications'
import { onMutationError } from '@/client/lib/toast-api-error'
import { Button } from '@/ui/components/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/ui/components/sheet'
import { Tabs, TabsList, TabsTrigger } from '@/ui/components/tabs'
import { useI18n } from '@/ui/lib/I18nProvider'
import { ComposeNotificationDialog } from '@/ui/shared/notifications/ComposeNotificationDialog'
import { NotificationBadge } from '@/ui/shared/notifications/NotificationBadge'
import { NotificationDetailPane } from '@/ui/shared/notifications/NotificationDetailPane'
import { NotificationListPane } from '@/ui/shared/notifications/NotificationListPane'

interface NotificationsDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Admins get the compose entry (direct + broadcast). */
  isAdmin: boolean
  /** Owned by the shell (one observer per shell) — the drawer never subscribes.
   *  `null` = unknown (not loaded / failed), distinct from a confirmed `0`. */
  unreadCount: number | null
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
export function NotificationsDrawer({ open, onOpenChange, isAdmin, unreadCount }: NotificationsDrawerProps) {
  const { t } = useI18n()
  const [tab, setTab] = useState<NotificationTab>('all')
  const [selected, setSelected] = useState<NotificationDto | null>(null)
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null)
  const [composeOpen, setComposeOpen] = useState(false)
  const invalidate = useInvalidateNotifications()
  const patchReadState = usePatchNotificationReadState()

  const markAllRead = useMutation(
    orpcQuery.notifications.markRead.mutationOptions({
      onSuccess: (data) => {
        // Every row in every tab changes, so the pages must refetch — seed the
        // badge from the authoritative count first so it never flickers.
        patchReadState([], true, data.count)
        void invalidate()
      },
      onError: onMutationError('admin.toast.operationFailed', t),
    }),
  )

  const closeDrawer = (next: boolean) => {
    onOpenChange(next)
    if (!next) {
      setSelected(null)
      // Closing the drawer hands focus back to its trigger — do not fight the
      // sheet's focus restoration with a row focus target.
      setLastSelectedId(null)
    }
  }

  const openItem = (item: NotificationDto) => {
    setSelected(item)
    setLastSelectedId(item.id)
  }

  return (
    <Sheet open={open} onOpenChange={closeDrawer}>
      <SheetContent side="right" className="gap-0 p-0 sm:max-w-md">
        {selected === null ? (
          <>
            <SheetHeader className="flex-row items-center gap-2 border-b pr-12">
              <SheetTitle className="flex-1 text-base">
                消息通知
                <NotificationBadge count={unreadCount ?? 0} className="ml-2" />
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
              <Tabs
                value={tab}
                onValueChange={(value) => {
                  if (isNotificationTab(value)) {
                    setTab(value)
                    // A pending row-focus target belongs to the previous tab.
                    setLastSelectedId(null)
                  }
                }}
              >
                <TabsList className="w-full">
                  {TAB_LABELS.map(({ value, label }) => (
                    <TabsTrigger key={value} value={value} className="flex-1">
                      {label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>
            <NotificationListPane
              key={tab}
              tab={tab}
              onOpen={openItem}
              focusItemId={lastSelectedId ?? undefined}
              onFocusHandled={() => setLastSelectedId(null)}
            />
          </>
        ) : (
          <NotificationDetailPane
            item={selected}
            isAdmin={isAdmin}
            onBack={() => setSelected(null)}
            onClose={() => closeDrawer(false)}
          />
        )}
      </SheetContent>
      {isAdmin ? <ComposeNotificationDialog open={composeOpen} onOpenChange={setComposeOpen} /> : null}
    </Sheet>
  )
}
