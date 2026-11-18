import type { NotificationDto, NotificationTab } from '@kobato/contracts/notifications.ts'
import type { UiMessageId } from '@kobato/i18n/messages/ui/en-US.ts'

import { Button } from '@kobato/ui/components/button.tsx'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@kobato/ui/components/sheet.tsx'
import { Tabs, TabsList, TabsTrigger } from '@kobato/ui/components/tabs.tsx'
import { useI18n } from '@kobato/ui/lib/I18nProvider.tsx'
import { orpcQuery } from '@kobato/web-client/api/orpc-query.ts'
import { onMutationError } from '@kobato/web-public/ui/lib/toast-api-error.ts'
import { ComposeNotificationDialog } from '@kobato/web-public/ui/shared/notifications/ComposeNotificationDialog.tsx'
import { NotificationBadge } from '@kobato/web-public/ui/shared/notifications/NotificationBadge.tsx'
import { NotificationDetailPane } from '@kobato/web-public/ui/shared/notifications/NotificationDetailPane.tsx'
import { NotificationListPane } from '@kobato/web-public/ui/shared/notifications/NotificationListPane.tsx'
import {
  useInvalidateNotifications,
  usePatchNotificationReadState,
} from '@kobato/web-public/ui/shared/notifications/use-notifications.ts'
import { useMutation } from '@tanstack/react-query'
import { CheckCheckIcon, SquarePenIcon } from 'lucide-react'
import { useState } from 'react'

interface NotificationsDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Admins get the compose entry (direct + broadcast). */
  isAdmin: boolean
  /** Owned by the shell (one observer per shell) — the drawer never subscribes.
   *  `null` = unknown (not loaded / failed), distinct from a confirmed `0`. */
  unreadCount: number | null
}

const TAB_VALUES: readonly NotificationTab[] = ['all', 'unread', 'direct', 'announce']

const TAB_LABEL_IDS: Record<NotificationTab, UiMessageId> = {
  all: 'notifications.tab.all',
  unread: 'notifications.tab.unread',
  direct: 'notifications.tab.direct',
  announce: 'notifications.tab.announce',
}

function isNotificationTab(value: unknown): value is NotificationTab {
  return TAB_VALUES.some((tab) => tab === value)
}

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
                {t('public.chrome.notifications')}
                <NotificationBadge count={unreadCount ?? 0} className="ml-2" />
              </SheetTitle>
              {isAdmin ? (
                <Button
                  variant="ghost"
                  size="iconSm"
                  onClick={() => setComposeOpen(true)}
                  aria-label={t('notifications.compose.title')}
                >
                  <SquarePenIcon className="size-4" />
                </Button>
              ) : null}
              <Button
                variant="ghost"
                size="iconSm"
                onClick={() => markAllRead.mutate({})}
                disabled={unreadCount === 0 || markAllRead.isPending}
                aria-label={t('notifications.markAllRead')}
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
                  {TAB_VALUES.map((value) => (
                    <TabsTrigger key={value} value={value} className="flex-1">
                      {t(TAB_LABEL_IDS[value])}
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
