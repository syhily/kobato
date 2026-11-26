import { guardLoader } from '@/lib/guard-loader'
import { titleMeta } from '@/seo/title-meta'
import { PostsView } from '@/ui/posts/PostsView'

export const clientLoader = guardLoader('author')

export const meta = titleMeta('meta.title.admin.posts')

export default function WpAdminPostsRoute() {
  return <PostsView />
}
