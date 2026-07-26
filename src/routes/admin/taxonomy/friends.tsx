import { requireRole } from '@/server/domains/auth/rbac'
import { getRequestContext } from '@/server/http/request-context'
import { titleMeta } from '@/shared/seo/title-meta'
import { FriendsView } from '@/ui/admin/friends/FriendsView'

import type { Route } from './+types/friends'

export async function loader({ request, context }: Route.LoaderArgs) {
  const rc = getRequestContext({ request, context })
  requireRole({ user: rc.viewer ?? undefined, role: rc.viewer?.role ?? null }, 'admin')
  return null
}

export const meta = titleMeta('友链管理')

export default function WpAdminFriendsRoute() {
  return <FriendsView />
}
