import { MoonIcon, SettingsIcon, SunIcon } from 'lucide-react'

import type { AdminShellProps } from '@/ui/admin/shell/AdminShell'

import { hasAtLeast } from '@/shared/utils/roles'
import { NavMenuItem } from '@/ui/admin/shell/NavMenuItem'
import { SidebarMenuItem } from '@/ui/components/sidebar'
import { Switch } from '@/ui/components/switch'
import { useI18n } from '@/ui/lib/I18nProvider'
import { useTheme } from '@/ui/lib/ThemeProvider'

interface NavSettingsProps {
  role: AdminShellProps['currentUser']['role']
}

export function NavSettings({ role }: NavSettingsProps) {
  const { t } = useI18n()
  if (!hasAtLeast(role, 'admin')) {
    return null
  }

  return (
    <>
      <NavMenuItem>
        <NavMenuItem.Link to="/admin/settings" activeMatch="subpath">
          <SettingsIcon />
          <NavMenuItem.Label>{t('meta.title.admin.settings')}</NavMenuItem.Label>
        </NavMenuItem.Link>
      </NavMenuItem>
      <ThemeToggleItem />
    </>
  )
}

function ThemeToggleItem() {
  const { t } = useI18n()
  const { resolvedTheme, setTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  return (
    <SidebarMenuItem>
      <div className="flex h-sidebar-item w-full items-center gap-3 overflow-hidden rounded-xl px-3 py-2 pl-4 text-left text-md font-medium text-sidebar-foreground transition-all hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
        {isDark ? <SunIcon className="size-4 shrink-0" /> : <MoonIcon className="size-4 shrink-0" />}
        <span className="flex-1 truncate">{isDark ? t('admin.shell.theme.light') : t('admin.shell.theme.dark')}</span>
        <Switch
          className="ml-auto h-5 w-9 [&>[data-slot=switch-thumb]]:size-4 [&>[data-slot=switch-thumb]]:data-[checked]:translate-x-4"
          checked={isDark}
          onCheckedChange={() => setTheme(isDark ? 'light' : 'dark')}
        />
      </div>
    </SidebarMenuItem>
  )
}
