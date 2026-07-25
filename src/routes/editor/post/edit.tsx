import { useNavigate } from 'react-router'

import { getRouteRequestContext } from '@/server/domains/auth/context'
import { requireRole } from '@/server/domains/auth/rbac'
import { titleMeta } from '@/shared/seo/title-meta'
import { PostEditorRoute } from '@/ui/admin/posts/PostEditorRoute'

import type { Route } from './+types/edit'

export async function loader({ request, context }: Route.LoaderArgs) {
  requireRole(getRouteRequestContext({ request, context }), 'author')
  return null
}

export const meta = titleMeta('编辑文章')

export default function WpAdminPostEditRoute({ params }: Route.ComponentProps) {
  const navigate = useNavigate()
  return <PostEditorRoute postId={params.id ?? ''} navigate={navigate} />
}
