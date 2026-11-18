import { guardOnlyLoader } from '@kobato/server/http/request-context.ts'
import { PostEditorRoute } from '@kobato/web-admin/ui/posts/PostEditorRoute.tsx'
import { useNavigate } from 'react-router'

import { titleMeta } from '@/seo/title-meta.ts'

import type { Route } from './+types/edit'

export const loader = guardOnlyLoader('author')

export const meta = titleMeta('meta.title.editor.postEdit')

export default function WpAdminPostEditRoute({ params }: Route.ComponentProps) {
  const navigate = useNavigate()
  return <PostEditorRoute postId={params.id ?? ''} navigate={navigate} />
}
