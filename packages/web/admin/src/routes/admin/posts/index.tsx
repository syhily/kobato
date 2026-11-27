import { guardLoader } from '@kobato/web-admin/lib/guard-loader'
import { titleMeta } from '@kobato/web-admin/seo/title-meta'
import { PostsView } from '@kobato/web-admin/ui/posts/PostsView'

export const clientLoader = guardLoader('author')

export const meta = titleMeta('meta.title.admin.posts')

export default function WpAdminPostsRoute() {
  return <PostsView />
}
