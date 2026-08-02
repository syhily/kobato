import type { AdminShellProps } from '@/ui/admin/shell/AdminShell'

import { NavContent } from '@/ui/admin/shell/NavContent'
import { NavMain } from '@/ui/admin/shell/NavMain'
import { NavSettings } from '@/ui/admin/shell/NavSettings'
import { SidebarContent } from '@/ui/components/sidebar'

interface AppSidebarContentProps {
  role: AdminShellProps['currentUser']['role']
  pendingCommentCount?: number
  pendingWebmentionCount?: number
  userCount?: number
}

export function AppSidebarContent({
  role,
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
        <NavSettings role={role} />
      </div>
    </SidebarContent>
  )
}
