import { useNavigate } from 'react-router'

import { requireRole } from '@/server/domains/auth/rbac'
import { getRequestContext } from '@/server/http/request-context'
import { titleMeta } from '@/shared/seo/title-meta'
import { PageEditorRoute } from '@/ui/admin/pages/PageEditorRoute'

import type { Route } from './+types/edit'

export async function loader({ request, context }: Route.LoaderArgs) {
  const rc = getRequestContext({ request, context })
  requireRole({ user: rc.viewer ?? undefined }, 'admin')
  return null
}

export const meta = titleMeta('编辑页面')

export default function WpAdminPageEditRoute({ params }: Route.ComponentProps) {
  const navigate = useNavigate()
  return <PageEditorRoute pageId={params.id ?? ''} navigate={navigate} />
}
