import { guardOnlyLoader } from '@kobato/server/http/request-context.ts'
import { titleMeta } from '@kobato/shared/seo/title-meta.ts'
import { useI18n } from '@kobato/ui/lib/I18nProvider.tsx'
import { CommentsView } from '@kobato/web/ui/admin/comments/CommentsView.tsx'
import { parseCommentFiltersFromSearchParams } from '@kobato/web/ui/admin/comments/useCommentsController.ts'
import { useOutletContext, useSearchParams } from 'react-router'

// The parse helper lives next to the controller's write-back so both URL directions stay in sync.

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
