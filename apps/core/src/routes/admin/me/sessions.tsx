import type { MySessionItem } from '@kobato/shared/types/sessions'

import { requireRole } from '@kobato/server/domains/auth/rbac'
import { listSessionsByUser } from '@kobato/server/domains/auth/services/sessions'
import { getRequestContext } from '@kobato/server/http/request-context'
import { titleMeta } from '@kobato/shared/seo/title-meta'
import { idFromString } from '@kobato/shared/utils/id'
import {
  DEFAULT_MY_SORT,
  MY_SESSION_SORT_OPTIONS,
  parseSessionSort,
  type SessionSortState,
} from '@kobato/shared/utils/sessions-sort'
import { MySessionsView } from '@kobato/ui/admin/my/MySessionsView'
import { data } from 'react-router'

import type { Route } from './+types/sessions'

export const meta = titleMeta('登录设备')

export async function loader({ request, context }: Route.LoaderArgs) {
  const rc = getRequestContext({ request, context })
  const ctx = { session: rc.session, user: rc.viewer ?? undefined, role: rc.viewer?.role ?? null }
  // admin.layout already gates on `visitor`; assert here to narrow
  // `ctx.user` and guard against a future layout refactor widening access.
  requireRole(ctx, 'visitor')
  const url = new URL(request.url)
  const sort: SessionSortState<'lastActive' | 'loginTime'> = parseSessionSort(
    url.searchParams.get('sort'),
    MY_SESSION_SORT_OPTIONS,
    DEFAULT_MY_SORT,
  )
  const userId = idFromString(ctx.user.id)
  const sessions = await listSessionsByUser(rc.db, userId)
  const sorted = [...sessions].sort((a, b) => {
    let cmp = 0
    switch (sort.field) {
      case 'loginTime':
        cmp = a.loginAt.getTime() - b.loginAt.getTime()
        break
      case 'lastActive':
      default:
        cmp = a.lastActiveAt.getTime() - b.lastActiveAt.getTime()
        break
    }
    return sort.direction === 'asc' ? cmp : -cmp
  })
  const items: MySessionItem[] = sorted.map((s) => ({
    sid: s.sid,
    userAgent: s.userAgent,
    platformHint: s.platformHint,
    ip: s.ip,
    loginAtIso: s.loginAt.toISOString(),
    lastActiveAtIso: s.lastActiveAt.toISOString(),
    expiresAtIso: s.expiresAt.toISOString(),
    isCurrent: s.sid === ctx.session.id,
  }))
  return data({ items })
}

export default function WpAdminMySessionsRoute({ loaderData }: Route.ComponentProps) {
  return <MySessionsView items={loaderData.items} />
}
