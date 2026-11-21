import type { MySessionItem } from '@kobato/contracts/sessions'

import { requireRole } from '@kobato/server/domains/auth/rbac'
import { createSsrCaller } from '@kobato/server/http/ssr-caller'
import { MySessionsView } from '@kobato/web-admin/ui/account/MySessionsView'
import {
  DEFAULT_MY_SORT,
  MY_SESSION_SORT_OPTIONS,
  parseSessionSort,
  type SessionSortState,
} from '@kobato/web-admin/ui/sessions/sort'
import { data } from 'react-router'

import { titleMeta } from '@/seo/title-meta'

import type { Route } from './+types/sessions'

export const meta = titleMeta('meta.title.admin.mySessions')

export async function loader({ request, context }: Route.LoaderArgs) {
  const { caller, viewer, session } = createSsrCaller({ request, context })
  requireRole(viewer ?? undefined, 'visitor')
  const url = new URL(request.url)
  const sort: SessionSortState<'lastActive' | 'loginTime'> = parseSessionSort(
    url.searchParams.get('sort'),
    MY_SESSION_SORT_OPTIONS,
    DEFAULT_MY_SORT,
  )
  const sessions = await caller.account.sessions()
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
    isCurrent: s.sid === session.id,
  }))
  return data({ items })
}

export default function WpAdminMySessionsRoute({ loaderData }: Route.ComponentProps) {
  return <MySessionsView items={loaderData.items} />
}
