import { guardLoader } from '@/lib/guard-loader'
import { titleMeta } from '@/seo/title-meta'
import { TagsView } from '@/ui/tags/TagsView'

export const clientLoader = guardLoader('author')

export const meta = titleMeta('meta.title.admin.tags')

export default function WpAdminTagsRoute() {
  return <TagsView />
}
