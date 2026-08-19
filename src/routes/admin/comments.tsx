import { useOutletContext, useSearchParams } from 'react-router'

import { guardOnlyLoader } from '@/server/http/request-context'
import { titleMeta } from '@/shared/seo/title-meta'
import { CommentsView } from '@/ui/admin/comments/CommentsView'
import { parseCommentFiltersFromSearchParams } from '@/ui/admin/comments/useCommentsController'

// The parse helper lives next to the controller's write-back so both URL directions stay in sync.

export const loader = guardOnlyLoader('admin')

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
