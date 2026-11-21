import { guardOnlyLoader } from '@kobato/server/http/request-context'
import { TagsView } from '@kobato/web-admin/ui/tags/TagsView'

import { titleMeta } from '@/seo/title-meta'

export const loader = guardOnlyLoader('author')

export const meta = titleMeta('meta.title.admin.tags')

export default function WpAdminTagsRoute() {
  return <TagsView />
}
