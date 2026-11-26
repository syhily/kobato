import type { NotificationDto, NotificationTab } from '@kobato/api/contracts/public/notifications'
import type { UiMessageId } from '@kobato/i18n/messages/ui/en-US'

import { orpcQuery } from '@kobato/api/browser/orpc-query'
import { Button } from '@kobato/ui/components/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@kobato/ui/components/sheet'
import { Tabs, TabsList, TabsTrigger } from '@kobato/ui/components/tabs'
import { useI18n } from '@kobato/ui/lib/I18nProvider'
import { onMutationError } from '@kobato/web-kit/ui/lib/toast-api-error'
import { ComposeNotificationDialog } from '@kobato/web-kit/ui/shared/notifications/ComposeNotificationDialog'
import { NotificationBadge } from '@kobato/web-kit/ui/shared/notifications/NotificationBadge'
import { NotificationDetailPane } from '@kobato/web-kit/ui/shared/notifications/NotificationDetailPane'
import { NotificationListPane } from '@kobato/web-kit/ui/shared/notifications/NotificationListPane'
import {
  useInvalidateNotifications,
  usePatchNotificationReadState,
} from '@kobato/web-kit/ui/shared/notifications/use-notifications'
import { useMutation } from '@tanstack/react-query'
import { CheckCheckIcon, SquarePenIcon } from 'lucide-react'
import { useState } from 'react'

interface NotificationsDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  isAdmin: boolean
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
    orpcQuery.public.notifications.markRead.mutationOptions({
      onSuccess: (data) => {
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
