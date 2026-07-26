import { useNavigate } from 'react-router'

import { requireRole } from '@/server/domains/auth/rbac'
import { getRequestContext } from '@/server/http/request-context'
import { titleMeta } from '@/shared/seo/title-meta'
import { PostEditorShell } from '@/ui/admin/posts/PostEditorShell'

import type { Route } from './+types/new'

export async function loader({ request, context }: Route.LoaderArgs) {
  const rc = getRequestContext({ request, context })
  requireRole({ user: rc.viewer ?? undefined }, 'author')
  return null
}

export const meta = titleMeta('新建文章')

export default function WpAdminPostNewRoute() {
  const navigate = useNavigate()
  return <PostEditorShell mode="create" navigate={navigate} />
}
