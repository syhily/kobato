import { useI18n } from '@kobato/ui/lib/I18nProvider'
import { useOutletContext, useSearchParams } from 'react-router'

import { guardLoader } from '@/lib/guard-loader'
import { titleMeta } from '@/seo/title-meta'
import { CommentsView } from '@/ui/comments/CommentsView'
import { parseCommentFiltersFromSearchParams } from '@/ui/comments/use-comments-controller'

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
