import { MoonIcon, SettingsIcon, SunIcon } from 'lucide-react'

import type { AdminShellProps } from '@/ui/admin/shell/AdminShell'

import { hasAtLeast } from '@/shared/utils/roles'
import { NavMenuItem } from '@/ui/admin/shell/NavMenuItem'
import { SidebarGroup, SidebarGroupContent, SidebarMenu, SidebarMenuItem } from '@/ui/components/sidebar'
import { Switch } from '@/ui/components/switch'
import { useTheme } from '@/ui/lib/ThemeProvider'

interface NavSettingsProps {
  role: AdminShellProps['currentUser']['role']
}

export function NavSettings({ role }: NavSettingsProps) {
  if (!hasAtLeast(role, 'admin')) {
    return null
  }

  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          <NavMenuItem>
            <NavMenuItem.Link to="/admin/settings" activeOnSubpath>
              <SettingsIcon />
              <NavMenuItem.Label>系统设置</NavMenuItem.Label>
            </NavMenuItem.Link>
          </NavMenuItem>
          <ThemeToggleItem />
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

function ThemeToggleItem() {
  const { resolvedTheme, setTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  return (
    <SidebarMenuItem>
      <div className="flex w-full items-center gap-3 overflow-hidden rounded-md px-3 py-2 pl-4 text-left text-md font-medium text-sidebar-foreground transition-all hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
        {isDark ? <SunIcon /> : <MoonIcon />}
        <span className="flex-1 truncate">{isDark ? '浅色模式' : '深色模式'}</span>
        <Switch
          className="ml-auto h-5 w-9 [&>[data-slot=switch-thumb]]:size-4 [&>[data-slot=switch-thumb]]:data-[checked]:translate-x-4"
          checked={isDark}
          onCheckedChange={() => setTheme(isDark ? 'light' : 'dark')}
        />
      </div>
    </SidebarMenuItem>
  )
}
