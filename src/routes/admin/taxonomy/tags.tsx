import { getRouteRequestContext } from '@/server/domains/auth/context'
import { requireRole } from '@/server/domains/auth/rbac'
import { bundleFromMatches, routeMeta } from '@/server/render/seo/meta'
import { TagsView } from '@/ui/admin/tags/TagsView'

import type { Route } from './+types/tags'

export async function loader({ request, context }: Route.LoaderArgs) {
  requireRole(getRouteRequestContext({ request, context }), 'author')
  return null
}

export function meta({ matches }: Route.MetaArgs) {
  return routeMeta({ title: '标签管理' }, bundleFromMatches(matches))
}

export default function WpAdminTagsRoute() {
  return <TagsView />
}
