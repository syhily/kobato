import { guardOnlyLoader } from '@kobato/server/http/request-context.ts'
import { useI18n } from '@kobato/ui/lib/I18nProvider.tsx'
import { CommentsView } from '@kobato/web-admin/ui/comments/CommentsView.tsx'
import { parseCommentFiltersFromSearchParams } from '@kobato/web-admin/ui/comments/use-comments-controller.ts'
import { useOutletContext, useSearchParams } from 'react-router'

import { titleMeta } from '@/seo/title-meta.ts'

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
