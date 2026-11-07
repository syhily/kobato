import type { AdminShellProps } from '@/ui/admin/shell/AdminShell'

import { NavContent } from '@/ui/admin/shell/NavContent'
import { NavMain } from '@/ui/admin/shell/NavMain'
import { NavNotifications } from '@/ui/admin/shell/NavNotifications'
import { NavSettings } from '@/ui/admin/shell/NavSettings'
import { SidebarContent } from '@/ui/components/sidebar'

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
    <SidebarContent className="justify-between px-3 pt-4">
      <div className="flex flex-col gap-2">
        <NavMain role={role} />
        <NavContent
          role={role}
          pendingCommentCount={pendingCommentCount}
          pendingWebmentionCount={pendingWebmentionCount}
          userCount={userCount}
        />
      </div>
      <div className="flex flex-col gap-2">
        <NavNotifications unreadCount={unreadCount} onOpen={onOpenNotifications} />
        <NavSettings role={role} />
      </div>
    </SidebarContent>
  )
}
