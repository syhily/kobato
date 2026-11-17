import type { AdminShellProps } from '@kobato/web/ui/admin/shell/AdminShell.tsx'

import { SidebarContent, SidebarGroup, SidebarGroupContent, SidebarMenu } from '@kobato/ui/components/sidebar.tsx'
import { NavContent } from '@kobato/web/ui/admin/shell/NavContent.tsx'
import { NavMain } from '@kobato/web/ui/admin/shell/NavMain.tsx'
import { NavNotifications } from '@kobato/web/ui/admin/shell/NavNotifications.tsx'
import { NavSettings } from '@kobato/web/ui/admin/shell/NavSettings.tsx'

interface AppSidebarContentProps {
  role: AdminShellProps['currentUser']['role']
  /** `null` = unknown (not loaded / failed), distinct from a confirmed `0`. */
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
