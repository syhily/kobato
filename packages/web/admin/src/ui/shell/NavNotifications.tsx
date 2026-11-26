import { SidebarMenuItem } from '@kobato/ui/components/sidebar'
import { useI18n } from '@kobato/ui/lib/I18nProvider'
import { warmNotificationsDrawerChunk } from '@kobato/web-kit/ui/shared/notifications/LazyNotificationsDrawer'
import { NotificationBadge } from '@kobato/web-kit/ui/shared/notifications/NotificationBadge'
import { BellIcon } from 'lucide-react'

interface NavNotificationsProps {
  unreadCount: number | null
  onOpen: () => void
}

export function NavNotifications({ unreadCount, onOpen }: NavNotificationsProps) {
  const { t } = useI18n()
  return (
    <SidebarMenuItem>
      <button
        type="button"
        className="flex h-sidebar-item w-full items-center gap-3 overflow-hidden rounded-xl px-3 py-2 pl-4 text-left text-md font-medium text-sidebar-foreground transition-all hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        onClick={() => onOpen()}
        onPointerEnter={warmNotificationsDrawerChunk}
      >
        <BellIcon className="size-4 shrink-0" />
        <span className="flex-1 truncate">{t('public.chrome.notifications')}</span>
        <NotificationBadge count={unreadCount ?? 0} />
      </button>
    </SidebarMenuItem>
  )
}
