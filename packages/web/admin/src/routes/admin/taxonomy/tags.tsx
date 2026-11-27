import { guardLoader } from '@kobato/web-admin/lib/guard-loader'
import { titleMeta } from '@kobato/web-admin/seo/title-meta'
import { TagsView } from '@kobato/web-admin/ui/tags/TagsView'

export const clientLoader = guardLoader('author')

export const meta = titleMeta('meta.title.admin.tags')

export default function WpAdminTagsRoute() {
  return <TagsView />
}
