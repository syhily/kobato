import { data } from 'react-router'

import { requireRole } from '@/server/domains/auth/rbac'
import { createSsrCaller } from '@/server/http/ssr-caller'
import { titleMeta } from '@/shared/seo/title-meta'
import {
  DEFAULT_ADMIN_SORT,
  SESSION_SORT_OPTIONS,
  parseSessionSort,
  type SessionSortState,
} from '@/shared/utils/sessions-sort'
import { SessionsView } from '@/ui/admin/sessions/SessionsView'

import type { Route } from './+types/sessions'

export const meta = titleMeta('会话管理')

export interface AdminSessionItem {
  sid: string
  userId: string
  userName: string
  userEmail: string
  userRole: 'admin' | 'author' | 'visitor' | null
  userAgent: string
  platformHint: string | null
  ip: string
  loginAtIso: string
  lastActiveAtIso: string
  expiresAtIso: string
  isCurrent: boolean
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const { caller, viewer, session } = createSsrCaller({ request, context })
  const ctx = { session, user: viewer ?? undefined, role: viewer?.role ?? null }
  requireRole(ctx, 'admin')
  const url = new URL(request.url)
  const sort: SessionSortState<'lastActive' | 'loginTime' | 'userName'> = parseSessionSort(
    url.searchParams.get('sort'),
    SESSION_SORT_OPTIONS,
    DEFAULT_ADMIN_SORT,
  )

  const all = await caller.admin.users.listSessions()
  const sorted = [...all].sort((a, b) => {
    let cmp = 0
    switch (sort.field) {
      case 'loginTime':
        cmp = a.loginAt.getTime() - b.loginAt.getTime()
        break
      case 'userName':
        cmp = a.userName.localeCompare(b.userName, 'zh-Hans-CN')
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

export default function WpAdminSessionsRoute({ loaderData }: Route.ComponentProps) {
  return <SessionsView items={loaderData.items} />
}
