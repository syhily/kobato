import { requireRole } from '@kobato/server/domains/auth/rbac'
import { getRequestContext } from '@kobato/server/http/request-context'
import { titleMeta } from '@kobato/shared/seo/title-meta'
import { PostEditorRoute } from '@kobato/ui/admin/posts/PostEditorRoute'
import { useNavigate } from 'react-router'

import { editorPreviewFace } from '@/routes/editor/preview-face'

import type { Route } from './+types/edit'

export async function loader({ request, context }: Route.LoaderArgs) {
  const rc = getRequestContext({ request, context })
  requireRole({ user: rc.viewer ?? undefined }, 'author')
  return { preview: editorPreviewFace(rc.viewer!.role) }
}

export const meta = titleMeta('编辑文章')

export default function WpAdminPostEditRoute({ params, loaderData }: Route.ComponentProps) {
  const navigate = useNavigate()
  return <PostEditorRoute postId={params.id ?? ''} navigate={navigate} preview={loaderData?.preview} />
}
