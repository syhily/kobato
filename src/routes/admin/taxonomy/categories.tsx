import { getRouteRequestContext } from '@/server/domains/auth/context'
import { requireRole } from '@/server/domains/auth/rbac'
import { titleMeta } from '@/shared/seo/title-meta'
import { CategoriesView } from '@/ui/admin/categories/CategoriesView'

import type { Route } from './+types/categories'

export async function loader({ request, context }: Route.LoaderArgs) {
  const ctx = getRouteRequestContext({ request, context })
  requireRole(ctx, 'admin')
  return null
}

export const meta = titleMeta('分类管理')

export default function WpAdminCategoriesRoute() {
  return <CategoriesView />
}
