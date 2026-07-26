import { useNavigate } from 'react-router'

import { requireRole } from '@/server/domains/auth/rbac'
import { getRequestContext } from '@/server/http/request-context'
import { titleMeta } from '@/shared/seo/title-meta'
import { PostEditorRoute } from '@/ui/admin/posts/PostEditorRoute'

import type { Route } from './+types/edit'

export async function loader({ request, context }: Route.LoaderArgs) {
  const rc = getRequestContext({ request, context })
  requireRole({ user: rc.viewer ?? undefined }, 'author')
  return null
}

export const meta = titleMeta('编辑文章')

export default function WpAdminPostEditRoute({ params }: Route.ComponentProps) {
  const navigate = useNavigate()
  return <PostEditorRoute postId={params.id ?? ''} navigate={navigate} />
}
