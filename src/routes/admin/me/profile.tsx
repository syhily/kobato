import { data } from 'react-router'

import { getRouteRequestContext } from '@/server/domains/auth/context'
import { requireRole } from '@/server/domains/auth/rbac'
import { countMyComments } from '@/server/domains/comments/repos/admin-query'
import { findUserById } from '@/server/infra/db/operations/user'
import { bundleFromMatches, routeMeta } from '@/server/render/seo/meta'
import { MyProfileView } from '@/ui/admin/my/MyProfileView'

import type { Route } from './+types/profile'

export function meta({ matches }: Route.MetaArgs) {
  return routeMeta({ title: '个人信息' }, bundleFromMatches(matches))
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const ctx = getRouteRequestContext({ request, context })
  // Self-service: any logged-in role (visitor, author, admin) can
  // edit their own row. admin.layout's `visitor` gate already
  // rejects anonymous visitors, but `requireRole` here keeps the
  // contract explicit for the loader.
  requireRole(ctx, 'visitor')
  const userId = BigInt(ctx.user.id)
  const [dbUser, counts] = await Promise.all([findUserById(userId), countMyComments(userId)])
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
    },
    counts,
  })
}

export default function WpAdminMyProfileRoute({ loaderData }: Route.ComponentProps) {
  return <MyProfileView user={loaderData.user} counts={loaderData.counts} />
}
