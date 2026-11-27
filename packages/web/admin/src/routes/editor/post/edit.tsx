import { guardLoader } from '@kobato/web-admin/lib/guard-loader'
import { titleMeta } from '@kobato/web-admin/seo/title-meta'
import { PostEditorRoute } from '@kobato/web-admin/ui/posts/PostEditorRoute'
import { useNavigate } from 'react-router'

import type { Route } from './+types/edit'

export const clientLoader = guardLoader('author')

export const meta = titleMeta('meta.title.editor.postEdit')

export default function WpAdminPostEditRoute({ params }: Route.ComponentProps) {
  const navigate = useNavigate()
  return <PostEditorRoute postId={params.id ?? ''} navigate={navigate} />
}
