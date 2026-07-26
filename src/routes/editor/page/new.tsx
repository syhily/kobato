import { useNavigate } from 'react-router'

import { requireRole } from '@/server/domains/auth/rbac'
import { getRequestContext } from '@/server/http/request-context'
import { titleMeta } from '@/shared/seo/title-meta'
import { PageEditorShell } from '@/ui/admin/pages/PageEditorShell'

import type { Route } from './+types/new'

export async function loader({ request, context }: Route.LoaderArgs) {
  const rc = getRequestContext({ request, context })
  requireRole({ user: rc.viewer ?? undefined }, 'admin')
  return null
}

export const meta = titleMeta('新建页面')

export default function WpAdminPageNewRoute() {
  const navigate = useNavigate()
  return <PageEditorShell mode="create" navigate={navigate} />
}
