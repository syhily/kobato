import { useNavigate } from 'react-router'

import { getRouteRequestContext } from '@/server/domains/auth/context'
import { requireRole } from '@/server/domains/auth/rbac'
import { titleMeta } from '@/shared/seo/title-meta'
import { PostEditorShell } from '@/ui/admin/posts/PostEditorShell'

import type { Route } from './+types/new'

export async function loader({ request, context }: Route.LoaderArgs) {
  requireRole(getRouteRequestContext({ request, context }), 'author')
  return null
}

export const meta = titleMeta('新建文章')

export default function WpAdminPostNewRoute() {
  const navigate = useNavigate()
  return <PostEditorShell mode="create" navigate={navigate} />
}
