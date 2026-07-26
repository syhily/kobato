import { requireRole } from '@/server/domains/auth/rbac'
import { getRequestContext } from '@/server/http/request-context'
import { titleMeta } from '@/shared/seo/title-meta'
import { UsersView } from '@/ui/admin/users/UsersView'

import type { Route } from './+types/index'

export async function loader({ request, context }: Route.LoaderArgs) {
  const rc = getRequestContext({ request, context })
  requireRole({ user: rc.viewer ?? undefined, role: rc.viewer?.role ?? null }, 'admin')
  return null
}

export const meta = titleMeta('用户管理')

export default function WpAdminUsersRoute() {
  return <UsersView />
}
