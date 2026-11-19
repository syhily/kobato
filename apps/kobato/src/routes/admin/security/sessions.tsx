import type { AdminSessionItem } from '@kobato/contracts/sessions.ts'

import { requireRole } from '@kobato/server/domains/auth/rbac.ts'
import { createSsrCaller } from '@kobato/server/http/ssr-caller.ts'
import { resolveAppLocalization } from '@kobato/settings/app-localization.ts'
import { compareDisplayText } from '@kobato/utils/format.ts'
import { SessionsView } from '@kobato/web-admin/ui/sessions/SessionsView.tsx'
import {
  DEFAULT_ADMIN_SORT,
  SESSION_SORT_OPTIONS,
  parseSessionSort,
  type SessionSortState,
} from '@kobato/web-admin/ui/sessions/sort.ts'
import { data } from 'react-router'

import { titleMeta } from '@/seo/title-meta.ts'

import type { Route } from './+types/sessions'

export const meta = titleMeta('meta.title.admin.sessions')

export async function loader({ request, context }: Route.LoaderArgs) {
  const { caller, viewer, session } = createSsrCaller({ request, context })
  requireRole(viewer ?? undefined, 'admin')
  const url = new URL(request.url)
  const sort: SessionSortState<'lastActive' | 'loginTime' | 'userName'> = parseSessionSort(
    url.searchParams.get('sort'),
    SESSION_SORT_OPTIONS,
    DEFAULT_ADMIN_SORT,
  )

  const all = await caller.admin.users.listSessions()
  const { locale } = resolveAppLocalization()
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
    isCurrent: s.sid === session.id,
  }))
  return data({ items })
}

export default function WpAdminSessionsRoute({ loaderData }: Route.ComponentProps) {
  return <SessionsView items={loaderData.items} />
}
