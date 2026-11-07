import { BellIcon } from 'lucide-react'
import { useState } from 'react'

import type { AdminShellProps } from '@/ui/admin/shell/AdminShell'

import { useUnreadNotificationCount } from '@/client/hooks/use-notifications'
import { SidebarGroup, SidebarGroupContent, SidebarMenu, SidebarMenuItem } from '@/ui/components/sidebar'
import {
  LazyNotificationsDrawer,
  warmNotificationsDrawerChunk,
} from '@/ui/shared/notifications/LazyNotificationsDrawer'
import { NotificationBadge } from '@/ui/shared/notifications/NotificationBadge'

interface NavNotificationsProps {
  role: AdminShellProps['currentUser']['role']
}

//「消息通知」sits in the sidebar's bottom group next to 系统设置 and opens
// the global right-side drawer — it is a button, not a route.
export function NavNotifications({ role }: NavNotificationsProps) {
  const [open, setOpen] = useState(false)
  const unreadCount = useUnreadNotificationCount()

  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <button
              type="button"
              className="flex h-sidebar-item w-full items-center gap-3 overflow-hidden rounded-xl px-3 py-2 pl-4 text-left text-md font-medium text-sidebar-foreground transition-all hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              onClick={() => setOpen(true)}
              onPointerEnter={warmNotificationsDrawerChunk}
            >
              <BellIcon className="size-4 shrink-0" />
              <span className="flex-1 truncate">消息通知</span>
              <NotificationBadge count={unreadCount} />
            </button>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
      <LazyNotificationsDrawer open={open} onOpenChange={setOpen} isAdmin={role === 'admin'} />
    </SidebarGroup>
  )
}
