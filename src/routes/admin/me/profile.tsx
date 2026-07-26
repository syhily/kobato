import { data } from 'react-router'

import { isPasskeyEnabled } from '@/server/domains/auth/passkey-gate'
import { requireRole } from '@/server/domains/auth/rbac'
import { countMyComments } from '@/server/domains/comments/repos/admin-query'
import { getRequestContext } from '@/server/http/request-context'
import { findUserById } from '@/server/infra/db/operations/user'
import { titleMeta } from '@/shared/seo/title-meta'
import { MyProfileView } from '@/ui/admin/my/MyProfileView'

import type { Route } from './+types/profile'

export const meta = titleMeta('个人信息')

export async function loader({ request, context }: Route.LoaderArgs) {
  const rc = getRequestContext({ request, context })
  const ctx = { user: rc.viewer ?? undefined, role: rc.viewer?.role ?? null }
  // Self-service: any logged-in role (visitor, author, admin) can
  // edit their own row. admin.layout's `visitor` gate already
  // rejects anonymous visitors, but `requireRole` here keeps the
  // contract explicit for the loader.
  requireRole(ctx, 'visitor')
  const userId = BigInt(ctx.user.id)
  const [dbUser, counts] = await Promise.all([findUserById(rc.db, userId), countMyComments(rc.db, userId)])
  return data({
    user: {
      id: ctx.user.id,
      name: dbUser?.name ?? '',
      email: dbUser?.email ?? '',
      link: dbUser?.link ?? '',
      role: dbUser?.role ?? null,
      badgeName: dbUser?.badgeName ?? '',
      badgeColor: dbUser?.badgeColor ?? '',
      createdAt: dbUser?.createdAt ? dbUser.createdAt.toISOString() : null,
      lastIp: dbUser?.lastIp ?? null,
      lastUa: dbUser?.lastUa ?? null,
      passkeyForce: dbUser?.passkeyForce ?? false,
    },
    counts,
    passkeyEnabled: isPasskeyEnabled(),
  })
}

export default function WpAdminMyProfileRoute({ loaderData }: Route.ComponentProps) {
  return <MyProfileView user={loaderData.user} counts={loaderData.counts} passkeyEnabled={loaderData.passkeyEnabled} />
}
