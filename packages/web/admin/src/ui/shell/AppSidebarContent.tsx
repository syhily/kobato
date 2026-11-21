import type { AdminShellProps } from '@kobato/web-admin/ui/shell/AdminShell'

import { SidebarContent, SidebarGroup, SidebarGroupContent, SidebarMenu } from '@kobato/ui/components/sidebar'
import { NavContent } from '@kobato/web-admin/ui/shell/NavContent'
import { NavMain } from '@kobato/web-admin/ui/shell/NavMain'
import { NavNotifications } from '@kobato/web-admin/ui/shell/NavNotifications'
import { NavSettings } from '@kobato/web-admin/ui/shell/NavSettings'

interface AppSidebarContentProps {
  role: AdminShellProps['currentUser']['role']
  unreadCount: number | null
  onOpenNotifications: () => void
  pendingCommentCount?: number
  pendingWebmentionCount?: number
  userCount?: number
}

export function AppSidebarContent({
  role,
  unreadCount,
  onOpenNotifications,
  pendingCommentCount,
  pendingWebmentionCount,
  userCount,
}: AppSidebarContentProps) {
  return (
    <SidebarContent className="justify-between px-6 pt-4">
      <div className="flex flex-col gap-2">
        <NavMain role={role} />
        <NavContent
          role={role}
          pendingCommentCount={pendingCommentCount}
          pendingWebmentionCount={pendingWebmentionCount}
          userCount={userCount}
        />
      </div>
      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarMenu>
            <NavNotifications unreadCount={unreadCount} onOpen={onOpenNotifications} />
            <NavSettings role={role} />
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarContent>
  )
}
