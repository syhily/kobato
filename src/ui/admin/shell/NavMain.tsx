import { ChartLineIcon, ExternalLinkIcon, HomeIcon } from 'lucide-react'

import type { AdminShellProps } from '@/ui/admin/shell/AdminShell'

import { hasAtLeast } from '@/shared/utils/roles'
import { NavMenuItem } from '@/ui/admin/shell/NavMenuItem'
import { SidebarGroup, SidebarGroupContent, SidebarMenu } from '@/ui/components/sidebar'

interface NavMainProps {
  role: AdminShellProps['currentUser']['role']
}

export function NavMain({ role }: NavMainProps) {
  if (!role) {
    return null
  }

  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          <NavMenuItem>
            <NavMenuItem.Link to="/admin" end>
              <HomeIcon />
              <NavMenuItem.Label>欢迎页面</NavMenuItem.Label>
            </NavMenuItem.Link>
          </NavMenuItem>

          {hasAtLeast(role, 'admin') && (
            <NavMenuItem>
              <NavMenuItem.Link to="/admin/analytics" activeOnSubpath>
                <ChartLineIcon />
                <NavMenuItem.Label>访问统计</NavMenuItem.Label>
              </NavMenuItem.Link>
            </NavMenuItem>
          )}

          <NavMenuItem>
            <NavMenuItem.Link
              to="/"
              target="_blank"
              rel="noopener noreferrer"
              isActive={false}
              aria-label="查看站点（在新标签页打开）"
            >
              <ExternalLinkIcon />
              <NavMenuItem.Label>查看站点</NavMenuItem.Label>
            </NavMenuItem.Link>
          </NavMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
