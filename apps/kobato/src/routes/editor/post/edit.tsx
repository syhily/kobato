import { useNavigate } from 'react-router'

import { guardLoader } from '@/lib/guard-loader'
import { titleMeta } from '@/seo/title-meta'
import { PostEditorRoute } from '@/ui/posts/PostEditorRoute'

import type { Route } from './+types/edit'

export const clientLoader = guardLoader('author')

export const meta = titleMeta('meta.title.editor.postEdit')

export default function WpAdminPostEditRoute({ params }: Route.ComponentProps) {
  const navigate = useNavigate()
  return <PostEditorRoute postId={params.id ?? ''} navigate={navigate} />
}
