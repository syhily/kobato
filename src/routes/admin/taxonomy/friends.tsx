import { getRouteRequestContext } from '@/server/domains/auth/context'
import { requireRole } from '@/server/domains/auth/rbac'
import { titleMeta } from '@/shared/seo/title-meta'
import { FriendsView } from '@/ui/admin/friends/FriendsView'

import type { Route } from './+types/friends'

export async function loader({ request, context }: Route.LoaderArgs) {
  const ctx = getRouteRequestContext({ request, context })
  requireRole(ctx, 'admin')
  return null
}

export const meta = titleMeta('友链管理')

export default function WpAdminFriendsRoute() {
  return <FriendsView />
}
