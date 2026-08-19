import { guardOnlyLoader } from '@/server/http/request-context'
import { titleMeta } from '@/shared/seo/title-meta'
import { TagsView } from '@/ui/admin/tags/TagsView'

export const loader = guardOnlyLoader('author')

export const meta = titleMeta('标签管理')

export default function WpAdminTagsRoute() {
  return <TagsView />
}
