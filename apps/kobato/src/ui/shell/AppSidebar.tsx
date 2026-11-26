import { Sidebar } from '@kobato/ui/components/sidebar'
import { LazyNotificationsDrawer } from '@kobato/web-kit/ui/shared/notifications/LazyNotificationsDrawer'
import { useUnreadNotificationCount } from '@kobato/web-kit/ui/shared/notifications/use-notifications'
import { useState } from 'react'

import type { AdminShellProps } from '@/ui/shell/AdminShell'

import { AppSidebarContent } from '@/ui/shell/AppSidebarContent'
import { AppSidebarFooter } from '@/ui/shell/AppSidebarFooter'
import { AppSidebarHeader } from '@/ui/shell/AppSidebarHeader'

interface AppSidebarProps {
  currentUser: AdminShellProps['currentUser']
  siteTitle?: string
  pendingCommentCount?: number
  pendingWebmentionCount?: number
  userCount?: number
}

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
