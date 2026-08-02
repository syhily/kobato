import type { AdminShellProps } from '@/ui/admin/shell/AdminShell'

import { AppSidebarContent } from '@/ui/admin/shell/AppSidebarContent'
import { AppSidebarFooter } from '@/ui/admin/shell/AppSidebarFooter'
import { AppSidebarHeader } from '@/ui/admin/shell/AppSidebarHeader'
import { Sidebar } from '@/ui/components/sidebar'

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
  return (
    <Sidebar collapsible="none">
      <AppSidebarHeader className="px-8 pt-10 pb-0" siteTitle={siteTitle} />
      <AppSidebarContent
        role={currentUser.role}
        pendingCommentCount={pendingCommentCount}
        pendingWebmentionCount={pendingWebmentionCount}
        userCount={userCount}
      />
      <AppSidebarFooter className="gap-0 p-5" id={currentUser.id} name={currentUser.name} email={currentUser.email} />
    </Sidebar>
  )
}
