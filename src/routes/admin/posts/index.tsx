import { guardOnlyLoader } from '@/server/http/request-context'
import { titleMeta } from '@/shared/seo/title-meta'
import { PostsView } from '@/ui/admin/posts/PostsView'

export const loader = guardOnlyLoader('author')

export const meta = titleMeta('文章管理')

export default function WpAdminPostsRoute() {
  return <PostsView />
}
