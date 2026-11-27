import type { MySessionItem } from '@kobato/api/contracts/account/self'

import { orpc } from '@kobato/api/browser/client'
import { awaitRootBootstrap, requireRoleFromBootstrap } from '@kobato/web-admin/lib/root-bootstrap'
import { titleMeta } from '@kobato/web-admin/seo/title-meta'
import { MySessionsView } from '@kobato/web-admin/ui/account/MySessionsView'
import {
  DEFAULT_MY_SORT,
  MY_SESSION_SORT_OPTIONS,
  parseSessionSort,
  type SessionSortState,
} from '@kobato/web-admin/ui/sessions/sort'
import { data } from 'react-router'

import type { Route } from './+types/sessions'

export const meta = titleMeta('meta.title.admin.mySessions')

export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  const boot = await awaitRootBootstrap()
  requireRoleFromBootstrap(boot, 'visitor', { pathname: new URL(request.url).pathname })
  const url = new URL(request.url)
  const sort: SessionSortState<'lastActive' | 'loginTime'> = parseSessionSort(
    url.searchParams.get('sort'),
    MY_SESSION_SORT_OPTIONS,
    DEFAULT_MY_SORT,
  )
  const sessions = await orpc.account.sessions()
  const sorted = [...sessions].sort((a, b) => {
    let cmp = 0
    switch (sort.field) {
      case 'loginTime':
        cmp = a.loginAt.getTime() - b.loginAt.getTime()
        break
      case 'lastActive':
        cmp = a.lastActiveAt.getTime() - b.lastActiveAt.getTime()
        break
    }
    return sort.direction === 'asc' ? cmp : -cmp
  })
  const items: MySessionItem[] = sorted.map((s) => ({
    sid: s.sid,
    label: s.label,
    ip: s.ip,
    loginAtIso: s.loginAt.toISOString(),
    lastActiveAtIso: s.lastActiveAt.toISOString(),
    expiresAtIso: s.expiresAt.toISOString(),
    isCurrent: s.isCurrent,
  }))
  return data({ items })
}

export default function WpAdminMySessionsRoute({ loaderData }: Route.ComponentProps) {
  return <MySessionsView items={loaderData.items} />
}
