import { ActivityIcon, ChartLineIcon, LinkIcon } from 'lucide-react'
import { NavLink, Outlet } from 'react-router'

import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'

import { guardOnlyLoader } from '@/server/http/request-context'
import { titleMeta } from '@/shared/seo/title-meta'
import { cn } from '@/ui/lib/cn'
import { useI18n } from '@/ui/lib/I18nProvider'

export const meta = titleMeta('meta.title.admin.analytics')

// Intentionally thin — the date-range picker + filters live on the child
// routes so the realtime feed isn't forced to react to range changes.
export const loader = guardOnlyLoader('admin')

const SUBNAV: readonly { to: string; labelId: UiMessageId; icon: typeof ChartLineIcon; end: boolean }[] = [
  { to: '/admin/analytics', labelId: 'admin.analytics.nav.overview', icon: ChartLineIcon, end: true },
  { to: '/admin/analytics/realtime', labelId: 'admin.analytics.nav.realtime', icon: ActivityIcon, end: false },
  { to: '/admin/analytics/mentions', labelId: 'admin.analytics.nav.mentions', icon: LinkIcon, end: false },
]

export default function WpAdminAnalyticsLayout() {
  const { t } = useI18n()
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold text-foreground">{t('admin.analytics.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('admin.analytics.description')}</p>
        <nav aria-label={t('admin.analytics.subnavAria')} className="flex items-center gap-1 border-b">
          {SUBNAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'inline-flex items-center gap-1.5 border-b-2 border-transparent px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground',
                  isActive && 'border-foreground text-foreground',
                )
              }
            >
              <item.icon className="size-4" />
              {t(item.labelId)}
            </NavLink>
          ))}
        </nav>
      </header>
      <Outlet />
    </div>
  )
}
