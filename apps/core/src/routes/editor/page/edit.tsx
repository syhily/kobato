import { requireRole } from '@kobato/server/domains/auth/rbac'
import { getRequestContext } from '@kobato/server/http/request-context'
import { titleMeta } from '@kobato/shared/seo/title-meta'
import { PageEditorRoute } from '@kobato/ui/admin/pages/PageEditorRoute'
import { useNavigate } from 'react-router'

import { editorPreviewFace } from '@/routes/editor/preview-face'

import type { Route } from './+types/edit'

export async function loader({ request, context }: Route.LoaderArgs) {
  const rc = getRequestContext({ request, context })
  requireRole({ user: rc.viewer ?? undefined }, 'admin')
  return { preview: editorPreviewFace(rc.viewer!.role) }
}

export const meta = titleMeta('编辑页面')

export default function WpAdminPageEditRoute({ params, loaderData }: Route.ComponentProps) {
  const navigate = useNavigate()
  return <PageEditorRoute pageId={params.id ?? ''} navigate={navigate} preview={loaderData?.preview} />
}
