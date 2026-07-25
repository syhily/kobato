import { getRouteRequestContext } from '@/server/domains/auth/context'
import { requireRole } from '@/server/domains/auth/rbac'
import { titleMeta } from '@/shared/seo/title-meta'
import { PostsView } from '@/ui/admin/posts/PostsView'

import type { Route } from './+types/index'

export async function loader({ request, context }: Route.LoaderArgs) {
  requireRole(getRouteRequestContext({ request, context }), 'author')
  return null
}

export const meta = titleMeta('文章管理')

export default function WpAdminPostsRoute() {
  return <PostsView />
}
