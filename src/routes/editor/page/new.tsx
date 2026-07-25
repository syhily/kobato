import { useNavigate } from 'react-router'

import { getRouteRequestContext } from '@/server/domains/auth/context'
import { requireRole } from '@/server/domains/auth/rbac'
import { titleMeta } from '@/shared/seo/title-meta'
import { PageEditorShell } from '@/ui/admin/pages/PageEditorShell'

import type { Route } from './+types/new'

export async function loader({ request, context }: Route.LoaderArgs) {
  const ctx = getRouteRequestContext({ request, context })
  requireRole(ctx, 'admin')
  return null
}

export const meta = titleMeta('新建页面')

export default function WpAdminPageNewRoute() {
  const navigate = useNavigate()
  return <PageEditorShell mode="create" navigate={navigate} />
}
