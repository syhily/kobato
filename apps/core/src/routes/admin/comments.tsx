import { requireRole } from '@kobato/server/domains/auth/rbac'
import { getRequestContext } from '@kobato/server/http/request-context'
import { titleMeta } from '@kobato/shared/seo/title-meta'
import { CommentsView } from '@kobato/ui/admin/comments/CommentsView'
import { parseCommentFiltersFromSearchParams } from '@kobato/ui/admin/comments/useCommentsController'
import { useOutletContext, useSearchParams } from 'react-router'

import type { Route } from './+types/comments'

// The parse helper lives next to the controller's write-back so both URL
// directions stay in sync; the route consumes it directly from there.

export async function loader({ request, context }: Route.LoaderArgs) {
  const rc = getRequestContext({ request, context })
  requireRole({ user: rc.viewer ?? undefined, role: rc.viewer?.role ?? null }, 'admin')
  return null
}

export const meta = titleMeta('评论管理')

export default function WpAdminCommentsRoute() {
  const { currentUser } = useOutletContext<{
    currentUser: { id: string; name: string; email: string }
  }>()
  const [searchParams] = useSearchParams()

  const initialFilters = parseCommentFiltersFromSearchParams(searchParams)

  return (
    <CommentsView
      currentUserName={currentUser.name}
      currentUserEmail={currentUser.email}
      initialFilters={initialFilters}
    />
  )
}
