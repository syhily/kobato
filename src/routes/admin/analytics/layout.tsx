import { ActivityIcon, ChartLineIcon, LinkIcon } from 'lucide-react'
import { NavLink, Outlet } from 'react-router'

import { requireRole } from '@/server/domains/auth/rbac'
import { getRequestContext } from '@/server/http/request-context'
import { titleMeta } from '@/shared/seo/title-meta'
import { cn } from '@/ui/lib/cn'

import type { Route } from './+types/layout'

export const meta = titleMeta('访问统计')

// Layout is intentionally thin — the date-range picker + filters live on
// the child routes so the realtime feed isn't forced to ignore the URL
// params or run a no-op revalidation on every range change.
export async function loader({ request, context }: Route.LoaderArgs) {
  const rc = getRequestContext({ request, context })
  const user = rc.viewer ?? undefined
  const role = rc.viewer?.role ?? null
  requireRole({ user, role }, 'admin')
  return null
}

const SUBNAV = [
  { to: '/admin/analytics', label: '概览', icon: ChartLineIcon, end: true },
  { to: '/admin/analytics/realtime', label: '实时', icon: ActivityIcon, end: false },
  { to: '/admin/analytics/mentions', label: '反向链接', icon: LinkIcon, end: false },
]

export default function WpAdminAnalyticsLayout() {
  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <header className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold text-foreground">访问统计</h1>
        <p className="text-sm text-muted-foreground">基于 access_log 时序表的访问、访客、来源、地理与设备分布。</p>
        <nav aria-label="统计子页" className="flex items-center gap-1 border-b">
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
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <Outlet />
    </div>
  )
}
