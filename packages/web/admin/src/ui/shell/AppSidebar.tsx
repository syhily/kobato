import type { AdminShellProps } from '@kobato/web-admin/ui/shell/AdminShell.tsx'

import { Sidebar } from '@kobato/ui/components/sidebar.tsx'
import { AppSidebarContent } from '@kobato/web-admin/ui/shell/AppSidebarContent.tsx'
import { AppSidebarFooter } from '@kobato/web-admin/ui/shell/AppSidebarFooter.tsx'
import { AppSidebarHeader } from '@kobato/web-admin/ui/shell/AppSidebarHeader.tsx'
import { LazyNotificationsDrawer } from '@kobato/web-public/ui/shared/notifications/LazyNotificationsDrawer.tsx'
import { useUnreadNotificationCount } from '@kobato/web-public/ui/shared/notifications/use-notifications.ts'
import { useState } from 'react'

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
