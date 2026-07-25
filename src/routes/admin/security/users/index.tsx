import { getRouteRequestContext } from '@/server/domains/auth/context'
import { requireRole } from '@/server/domains/auth/rbac'
import { titleMeta } from '@/shared/seo/title-meta'
import { UsersView } from '@/ui/admin/users/UsersView'

import type { Route } from './+types/index'

export async function loader({ request, context }: Route.LoaderArgs) {
  const ctx = getRouteRequestContext({ request, context })
  requireRole(ctx, 'admin')
  return null
}

export const meta = titleMeta('用户管理')

export default function WpAdminUsersRoute() {
  return <UsersView />
}
