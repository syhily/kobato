import { ChartLineIcon, ExternalLinkIcon, HomeIcon } from 'lucide-react'

import type { AdminShellProps } from '@/ui/admin/shell/AdminShell'

import { hasAtLeast } from '@/shared/utils/roles'
import { NavMenuItem } from '@/ui/admin/shell/NavMenuItem'
import { SidebarGroup, SidebarGroupContent, SidebarMenu } from '@/ui/components/sidebar'
import { useI18n } from '@/ui/lib/I18nProvider'

interface NavMainProps {
  role: AdminShellProps['currentUser']['role']
}

export function NavMain({ role }: NavMainProps) {
  const { t } = useI18n()
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
              <NavMenuItem.Label>{t('admin.shell.nav.dashboard')}</NavMenuItem.Label>
            </NavMenuItem.Link>
          </NavMenuItem>

          {hasAtLeast(role, 'admin') && (
            <NavMenuItem>
              <NavMenuItem.Link to="/admin/analytics" activeMatch="subpath">
                <ChartLineIcon />
                <NavMenuItem.Label>{t('meta.title.admin.analytics')}</NavMenuItem.Label>
              </NavMenuItem.Link>
            </NavMenuItem>
          )}

          <NavMenuItem>
            <NavMenuItem.Link
              to="/"
              target="_blank"
              rel="noopener noreferrer"
              isActive={false}
              aria-label={t('admin.shell.nav.viewSiteAria')}
            >
              <ExternalLinkIcon />
              <NavMenuItem.Label>{t('admin.shell.nav.viewSite')}</NavMenuItem.Label>
            </NavMenuItem.Link>
          </NavMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
