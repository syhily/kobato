import { BellIcon } from 'lucide-react'
import { useState } from 'react'

import type { AdminShellProps } from '@/ui/admin/shell/AdminShell'

import { useUnreadNotificationCount } from '@/client/hooks/use-notifications'
import { SidebarGroup, SidebarGroupContent, SidebarMenu, SidebarMenuItem } from '@/ui/components/sidebar'
import { NotificationsDrawer } from '@/ui/shared/notifications/NotificationsDrawer'

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
            >
              <BellIcon className="size-4 shrink-0" />
              <span className="flex-1 truncate">消息通知</span>
              {unreadCount > 0 ? (
                <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              ) : null}
            </button>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
      <NotificationsDrawer open={open} onOpenChange={setOpen} isAdmin={role === 'admin'} />
    </SidebarGroup>
  )
}
