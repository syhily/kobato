import { guardOnlyLoader } from '@kobato/server/http/request-context.ts'
import { TagsView } from '@kobato/web/ui/admin/tags/TagsView.tsx'

import { titleMeta } from '@/seo/title-meta.ts'

export const loader = guardOnlyLoader('author')

export const meta = titleMeta('meta.title.admin.tags')

export default function WpAdminTagsRoute() {
  return <TagsView />
}
