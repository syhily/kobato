import { BellIcon } from 'lucide-react'

import { SidebarMenuItem } from '@/ui/components/sidebar'
import { useI18n } from '@/ui/lib/I18nProvider'
import { warmNotificationsDrawerChunk } from '@/ui/shared/notifications/LazyNotificationsDrawer'
import { NotificationBadge } from '@/ui/shared/notifications/NotificationBadge'

interface NavNotificationsProps {
  /** Supplied by the shell's single count owner — never subscribe here.
   *  `null` = unknown (not loaded / failed), distinct from a confirmed `0`. */
  unreadCount: number | null
  onOpen: () => void
}

//「消息通知」renders as a bare menu item — AppSidebarContent groups it with
// 系统设置 in one menu so the bottom entries share item spacing. It is a
// button opening the global right-side drawer, not a route.
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
