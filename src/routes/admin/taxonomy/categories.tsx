import { requireRole } from '@/server/domains/auth/rbac'
import { getRequestContext } from '@/server/http/request-context'
import { titleMeta } from '@/shared/seo/title-meta'
import { CategoriesView } from '@/ui/admin/categories/CategoriesView'

import type { Route } from './+types/categories'

export async function loader({ request, context }: Route.LoaderArgs) {
  const rc = getRequestContext({ request, context })
  requireRole({ user: rc.viewer ?? undefined, role: rc.viewer?.role ?? null }, 'admin')
  return null
}

export const meta = titleMeta('分类管理')

export default function WpAdminCategoriesRoute() {
  return <CategoriesView />
}
