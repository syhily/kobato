import { requireRole } from '@kobato/server/domains/auth/rbac'
import { getRequestContext } from '@kobato/server/http/request-context'
import { titleMeta } from '@kobato/shared/seo/title-meta'
import { PostEditorShell } from '@kobato/ui/admin/posts/PostEditorShell'
import { useNavigate } from 'react-router'

import { editorPreviewFace } from '@/routes/editor/preview-face'

import type { Route } from './+types/new'

export async function loader({ request, context }: Route.LoaderArgs) {
  const rc = getRequestContext({ request, context })
  requireRole({ user: rc.viewer ?? undefined }, 'author')
  return { preview: editorPreviewFace(rc.viewer!.role) }
}

export const meta = titleMeta('新建文章')

export default function WpAdminPostNewRoute({ loaderData }: Route.ComponentProps) {
  const navigate = useNavigate()
  return <PostEditorShell mode="create" navigate={navigate} preview={loaderData?.preview} />
}
