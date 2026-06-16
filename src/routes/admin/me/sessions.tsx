import { data } from 'react-router'

import { getDbFromContext, getRouteRequestContext } from '@/server/domains/auth/context'
import { requireRole } from '@/server/domains/auth/rbac'
import { listSessionsByUser } from '@/server/domains/auth/service'
import { bundleFromMatches, routeMeta } from '@/server/render/seo/meta'
import {
  DEFAULT_MY_SORT,
  MY_SESSION_SORT_OPTIONS,
  parseSessionSort,
  type SessionSortState,
} from '@/shared/utils/sessions-sort'
import { MySessionsView } from '@/ui/admin/my/MySessionsView'

import type { Route } from './+types/sessions'

export function meta({ matches }: Route.MetaArgs) {
  return routeMeta({ title: '登录设备' }, bundleFromMatches(matches))
}

export interface MySessionItem {
  sid: string
  userAgent: string
  platformHint: string | null
  ip: string
  loginAtIso: string
  lastActiveAtIso: string
  expiresAtIso: string
  isCurrent: boolean
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = getDbFromContext({ request, context })
  const ctx = getRouteRequestContext({ request, context })
  // admin.layout already gates on `visitor`, but assert here so
  // the loader narrows `ctx.user` to non-null and so a future
  // refactor of the layout can't accidentally widen access.
  requireRole(ctx, 'visitor')
  const url = new URL(request.url)
  const sort: SessionSortState<'lastActive' | 'loginTime'> = parseSessionSort(
    url.searchParams.get('sort'),
    MY_SESSION_SORT_OPTIONS,
    DEFAULT_MY_SORT,
  )
  const userId = BigInt(ctx.user.id)
  const sessions = await listSessionsByUser(db, userId)
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
