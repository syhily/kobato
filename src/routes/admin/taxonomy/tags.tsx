import { requireRole } from '@/server/domains/auth/rbac'
import { getRequestContext } from '@/server/http/request-context'
import { titleMeta } from '@/shared/seo/title-meta'
import { TagsView } from '@/ui/admin/tags/TagsView'

import type { Route } from './+types/tags'

export async function loader({ request, context }: Route.LoaderArgs) {
  const rc = getRequestContext({ request, context })
  requireRole({ user: rc.viewer ?? undefined, role: rc.viewer?.role ?? null }, 'author')
  return null
}

export const meta = titleMeta('标签管理')

export default function WpAdminTagsRoute() {
  return <TagsView />
}
