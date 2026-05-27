import { data } from 'react-router'

import { getDbFromContext, getRouteRequestContext } from '@/server/domains/auth/context'
import { requireRole } from '@/server/domains/auth/rbac'
import { listSessionsByUser } from '@/server/domains/auth/service'
import { bundleFromMatches, routeMeta } from '@/server/render/seo/meta'
import { MySessionsView } from '@/ui/admin/my/MySessionsView'

import type { Route } from './+types/sessions'

export function meta({ matches }: Route.MetaArgs) {
  return routeMeta({ title: '登录设备' }, bundleFromMatches(matches))
}

export interface MySessionItem {
  sid: string
  userAgent: string
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
  const userId = BigInt(ctx.user.id)
  const sessions = await listSessionsByUser(db, userId)
  // Sort newest-active first so the row most likely to be the
  // current device sits at the top.
  sessions.sort((a, b) => b.lastActiveAt.getTime() - a.lastActiveAt.getTime())
  const items: MySessionItem[] = sessions.map((s) => ({
    sid: s.sid,
    userAgent: s.userAgent,
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
