import { useI18n } from '@kobato/ui/lib/I18nProvider'
import { guardLoader } from '@kobato/web-admin/lib/guard-loader'
import { titleMeta } from '@kobato/web-admin/seo/title-meta'
import { CommentsView } from '@kobato/web-admin/ui/comments/CommentsView'
import { parseCommentFiltersFromSearchParams } from '@kobato/web-admin/ui/comments/use-comments-controller'
import { useOutletContext, useSearchParams } from 'react-router'

export const clientLoader = guardLoader('admin')

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
