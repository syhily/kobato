import type { AdminSessionItem } from '@kobato/api/contracts/admin/users'

import { orpc } from '@kobato/api/browser/client'
import { compareDisplayText } from '@kobato/utils/format'
import { data } from 'react-router'

import { awaitRootBootstrap, requireRoleFromBootstrap } from '@/lib/root-bootstrap'
import { titleMeta } from '@/seo/title-meta'
import { SessionsView } from '@/ui/sessions/SessionsView'
import { DEFAULT_ADMIN_SORT, SESSION_SORT_OPTIONS, parseSessionSort, type SessionSortState } from '@/ui/sessions/sort'

import type { Route } from './+types/sessions'

export const meta = titleMeta('meta.title.admin.sessions')

export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  const boot = await awaitRootBootstrap()
  requireRoleFromBootstrap(boot, 'admin', { pathname: new URL(request.url).pathname })
  const url = new URL(request.url)
  const sort: SessionSortState<'lastActive' | 'loginTime' | 'userName'> = parseSessionSort(
    url.searchParams.get('sort'),
    SESSION_SORT_OPTIONS,
    DEFAULT_ADMIN_SORT,
  )

  const all = await orpc.admin.users.listSessions()
  const locale = boot.i18n.locale
  const sorted = [...all].sort((a, b) => {
    let cmp = 0
    switch (sort.field) {
      case 'loginTime':
        cmp = a.loginAt.getTime() - b.loginAt.getTime()
        break
      case 'userName':
        cmp = compareDisplayText(a.userName, b.userName, locale)
        break
      case 'lastActive':
        cmp = a.lastActiveAt.getTime() - b.lastActiveAt.getTime()
        break
    }
    return sort.direction === 'asc' ? cmp : -cmp
  })

  const items: AdminSessionItem[] = sorted.map((s) => ({
    sid: s.sid,
    userId: s.userId.toString(),
    userName: s.userName,
    userEmail: s.userEmail,
    userRole: s.userRole,
    label: s.label,
    ip: s.ip,
    loginAtIso: s.loginAt.toISOString(),
    lastActiveAtIso: s.lastActiveAt.toISOString(),
    expiresAtIso: s.expiresAt.toISOString(),
    isCurrent: s.isCurrent,
  }))
  return data({ items })
}

export default function WpAdminSessionsRoute({ loaderData }: Route.ComponentProps) {
  return <SessionsView items={loaderData.items} />
}
