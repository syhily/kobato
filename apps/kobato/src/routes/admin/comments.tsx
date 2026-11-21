import { guardOnlyLoader } from '@kobato/server/http/request-context'
import { useI18n } from '@kobato/ui/lib/I18nProvider'
import { CommentsView } from '@kobato/web-admin/ui/comments/CommentsView'
import { parseCommentFiltersFromSearchParams } from '@kobato/web-admin/ui/comments/use-comments-controller'
import { useOutletContext, useSearchParams } from 'react-router'

import { titleMeta } from '@/seo/title-meta'

export const loader = guardOnlyLoader('admin')

export const meta = titleMeta('meta.title.admin.comments')

export default function WpAdminCommentsRoute() {
  const { currentUser } = useOutletContext<{
    currentUser: { id: string; name: string; email: string }
  }>()
  const { t } = useI18n()
  const [searchParams] = useSearchParams()

  const initialFilters = parseCommentFiltersFromSearchParams(searchParams, t)

  return (
    <CommentsView
      currentUserName={currentUser.name}
      currentUserEmail={currentUser.email}
      initialFilters={initialFilters}
    />
  )
}
