import { useNavigate } from 'react-router'

import { guardOnlyLoader } from '@/server/http/request-context'
import { titleMeta } from '@/shared/seo/title-meta'
import { PostEditorRoute } from '@/ui/admin/posts/PostEditorRoute'

import type { Route } from './+types/edit'

export const loader = guardOnlyLoader('author')

export const meta = titleMeta('meta.title.editor.postEdit')

export default function WpAdminPostEditRoute({ params }: Route.ComponentProps) {
  const navigate = useNavigate()
  return <PostEditorRoute postId={params.id ?? ''} navigate={navigate} />
}
