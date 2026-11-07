import { useState } from 'react'

import type { AdminShellProps } from '@/ui/admin/shell/AdminShell'

import { useUnreadNotificationCount } from '@/client/hooks/use-notifications'
import { AppSidebarContent } from '@/ui/admin/shell/AppSidebarContent'
import { AppSidebarFooter } from '@/ui/admin/shell/AppSidebarFooter'
import { AppSidebarHeader } from '@/ui/admin/shell/AppSidebarHeader'
import { Sidebar } from '@/ui/components/sidebar'
import { LazyNotificationsDrawer } from '@/ui/shared/notifications/LazyNotificationsDrawer'

interface AppSidebarProps {
  currentUser: AdminShellProps['currentUser']
  siteTitle?: string
  pendingCommentCount?: number
  pendingWebmentionCount?: number
  userCount?: number
}

// The admin shell's ONE notification owner: both「消息通知」entries (the nav
// item and the user menu) open this drawer, and the badge count is subscribed
// here once instead of per entry point — interval refetches are per-observer
// and do not dedupe (ADR-0009).
export function AppSidebar({
  currentUser,
  siteTitle,
  pendingCommentCount,
  pendingWebmentionCount,
  userCount,
}: AppSidebarProps) {
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const unreadCount = useUnreadNotificationCount()
  const openNotifications = () => setNotificationsOpen(true)

  return (
    <Sidebar collapsible="none">
      <AppSidebarHeader className="px-8 pt-10 pb-0" siteTitle={siteTitle} />
      <AppSidebarContent
        role={currentUser.role}
        unreadCount={unreadCount}
        onOpenNotifications={openNotifications}
        pendingCommentCount={pendingCommentCount}
        pendingWebmentionCount={pendingWebmentionCount}
        userCount={userCount}
      />
      <AppSidebarFooter
        className="gap-0 p-5"
        id={currentUser.id}
        name={currentUser.name}
        email={currentUser.email}
        unreadCount={unreadCount}
        onOpenNotifications={openNotifications}
      />
      <LazyNotificationsDrawer
        open={notificationsOpen}
        onOpenChange={setNotificationsOpen}
        isAdmin={currentUser.role === 'admin'}
        unreadCount={unreadCount}
      />
    </Sidebar>
  )
}
