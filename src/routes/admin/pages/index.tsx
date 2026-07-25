import { getRouteRequestContext } from '@/server/domains/auth/context'
import { requireRole } from '@/server/domains/auth/rbac'
import { titleMeta } from '@/shared/seo/title-meta'
import { PagesView } from '@/ui/admin/pages/PagesView'

import type { Route } from './+types/index'

export async function loader({ request, context }: Route.LoaderArgs) {
  const ctx = getRouteRequestContext({ request, context })
  requireRole(ctx, 'admin')
  return null
}

export const meta = titleMeta('页面管理')

export default function WpAdminPagesRoute() {
  return <PagesView />
}
