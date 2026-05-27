import { data } from 'react-router'

import { getDbFromContext, getRouteRequestContext } from '@/server/domains/auth/context'
import { requireRole } from '@/server/domains/auth/rbac'
import { listAllSessions } from '@/server/domains/auth/service'
import { bundleFromMatches, routeMeta } from '@/server/render/seo/meta'
import { SessionsView } from '@/ui/admin/sessions/SessionsView'

import type { Route } from './+types/sessions'

export function meta({ matches }: Route.MetaArgs) {
  return routeMeta({ title: '会话管理' }, bundleFromMatches(matches))
}

type SortKey = 'lastActive' | 'loginTime' | 'userName'

const SORT_VALUES: ReadonlySet<SortKey> = new Set<SortKey>(['lastActive', 'loginTime', 'userName'])

function parseSort(raw: string | null): SortKey {
  if (raw && SORT_VALUES.has(raw as SortKey)) {
    return raw as SortKey
  }
  return 'lastActive'
}

function parseDateBoundary(raw: string | null, edge: 'start' | 'end'): number | null {
  if (!raw) {
    return null
  }
  // `<Input type="date">` returns YYYY-MM-DD; parse as local midnight
  // for the "from" bound and local end-of-day for the "to" bound so
  // a single-day filter is inclusive on both ends.
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) {
    return null
  }
  const [, y, m, d] = match
  const date = new Date(Number(y), Number(m) - 1, Number(d))
  if (Number.isNaN(date.getTime())) {
    return null
  }
  if (edge === 'end') {
    date.setHours(23, 59, 59, 999)
  }
  return date.getTime()
}

export interface AdminSessionItem {
  sid: string
  userId: string
  userName: string
  userEmail: string
  userRole: 'admin' | 'author' | 'visitor' | null
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
  requireRole(ctx, 'admin')
  const url = new URL(request.url)
  const q = (url.searchParams.get('q') ?? '').trim().toLowerCase()
  const sort = parseSort(url.searchParams.get('sort'))
  const from = parseDateBoundary(url.searchParams.get('from'), 'start')
  const to = parseDateBoundary(url.searchParams.get('to'), 'end')

  const all = await listAllSessions(db)
  let filtered = all
  if (q) {
    filtered = filtered.filter((s) => s.userName.toLowerCase().includes(q) || s.userEmail.toLowerCase().includes(q))
  }
  if (from !== null) {
    filtered = filtered.filter((s) => s.loginAt.getTime() >= from)
  }
  if (to !== null) {
    filtered = filtered.filter((s) => s.loginAt.getTime() <= to)
  }

  filtered.sort((a, b) => {
    switch (sort) {
      case 'loginTime':
        return b.loginAt.getTime() - a.loginAt.getTime()
      case 'userName':
        return a.userName.localeCompare(b.userName, 'zh-Hans-CN')
      case 'lastActive':
      default:
        return b.lastActiveAt.getTime() - a.lastActiveAt.getTime()
    }
  })

  const items: AdminSessionItem[] = filtered.map((s) => ({
    sid: s.sid,
    userId: s.userId.toString(),
    userName: s.userName,
    userEmail: s.userEmail,
    userRole: s.userRole,
    userAgent: s.userAgent,
    ip: s.ip,
    loginAtIso: s.loginAt.toISOString(),
    lastActiveAtIso: s.lastActiveAt.toISOString(),
    expiresAtIso: s.expiresAt.toISOString(),
    isCurrent: s.sid === ctx.session.id,
  }))
  return data({
    items,
    filters: {
      q: url.searchParams.get('q') ?? '',
      from: url.searchParams.get('from') ?? '',
      to: url.searchParams.get('to') ?? '',
      sort,
    },
  })
}

export default function WpAdminSessionsRoute({ loaderData }: Route.ComponentProps) {
  return <SessionsView items={loaderData.items} filters={loaderData.filters} />
}
