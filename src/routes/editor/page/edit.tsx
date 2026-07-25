import { useNavigate } from 'react-router'

import { getRouteRequestContext } from '@/server/domains/auth/context'
import { requireRole } from '@/server/domains/auth/rbac'
import { titleMeta } from '@/shared/seo/title-meta'
import { PageEditorRoute } from '@/ui/admin/pages/PageEditorRoute'

import type { Route } from './+types/edit'

export async function loader({ request, context }: Route.LoaderArgs) {
  const ctx = getRouteRequestContext({ request, context })
  requireRole(ctx, 'admin')
  return null
}

export const meta = titleMeta('编辑页面')

export default function WpAdminPageEditRoute({ params }: Route.ComponentProps) {
  const navigate = useNavigate()
  return <PageEditorRoute pageId={params.id ?? ''} navigate={navigate} />
}
