import { guardOnlyLoader } from '@kobato/server/http/request-context'
import { PostsView } from '@kobato/web-admin/ui/posts/PostsView'

import { titleMeta } from '@/seo/title-meta'

export const loader = guardOnlyLoader('author')

export const meta = titleMeta('meta.title.admin.posts')

export default function WpAdminPostsRoute() {
  return <PostsView />
}
