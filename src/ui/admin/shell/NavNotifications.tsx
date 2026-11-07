import { BellIcon } from 'lucide-react'

import { SidebarGroup, SidebarGroupContent, SidebarMenu, SidebarMenuItem } from '@/ui/components/sidebar'
import { warmNotificationsDrawerChunk } from '@/ui/shared/notifications/LazyNotificationsDrawer'
import { NotificationBadge } from '@/ui/shared/notifications/NotificationBadge'

interface NavNotificationsProps {
  /** Supplied by the shell's single count owner — never subscribe here. */
  unreadCount: number
  onOpen: () => void
}

//「消息通知」sits in the sidebar's bottom group next to 系统设置 and opens
// the global right-side drawer — it is a button, not a route.
export function NavNotifications({ unreadCount, onOpen }: NavNotificationsProps) {
  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <button
              type="button"
              className="flex h-sidebar-item w-full items-center gap-3 overflow-hidden rounded-xl px-3 py-2 pl-4 text-left text-md font-medium text-sidebar-foreground transition-all hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              onClick={() => onOpen()}
              onPointerEnter={warmNotificationsDrawerChunk}
            >
              <BellIcon className="size-4 shrink-0" />
              <span className="flex-1 truncate">消息通知</span>
              <NotificationBadge count={unreadCount} />
            </button>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
