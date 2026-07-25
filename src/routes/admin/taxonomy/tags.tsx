import { getRouteRequestContext } from '@/server/domains/auth/context'
import { requireRole } from '@/server/domains/auth/rbac'
import { titleMeta } from '@/shared/seo/title-meta'
import { TagsView } from '@/ui/admin/tags/TagsView'

import type { Route } from './+types/tags'

export async function loader({ request, context }: Route.LoaderArgs) {
  requireRole(getRouteRequestContext({ request, context }), 'author')
  return null
}

export const meta = titleMeta('标签管理')

export default function WpAdminTagsRoute() {
  return <TagsView />
}
