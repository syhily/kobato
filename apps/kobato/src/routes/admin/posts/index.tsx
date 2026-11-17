import { guardOnlyLoader } from '@kobato/server/http/request-context.ts'
import { PostsView } from '@kobato/web/ui/admin/posts/PostsView.tsx'

import { titleMeta } from '@/seo/title-meta.ts'

export const loader = guardOnlyLoader('author')

export const meta = titleMeta('meta.title.admin.posts')

export default function WpAdminPostsRoute() {
  return <PostsView />
}
