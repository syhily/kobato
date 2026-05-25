import { getRouteRequestContext } from '@/server/domains/auth/context'
import { requireRole } from '@/server/domains/auth/rbac'
import { bundleFromMatches, routeMeta } from '@/server/render/seo/meta'
import { CategoriesView } from '@/ui/admin/categories/CategoriesView'

import type { Route } from './+types/categories'

export async function loader({ request, context }: Route.LoaderArgs) {
  const ctx = getRouteRequestContext({ request, context })
  requireRole(ctx, 'admin')
  return null
}

export function meta({ matches }: Route.MetaArgs) {
  return routeMeta({ title: '分类管理' }, bundleFromMatches(matches))
}

export default function WpAdminCategoriesRoute() {
  return <CategoriesView />
}
