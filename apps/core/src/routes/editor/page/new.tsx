import { requireRole } from '@kobato/server/domains/auth/rbac'
import { getRequestContext } from '@kobato/server/http/request-context'
import { titleMeta } from '@kobato/shared/seo/title-meta'
import { PageEditorShell } from '@kobato/ui/admin/pages/PageEditorShell'
import { useNavigate } from 'react-router'

import { editorPreviewFace } from '@/routes/editor/preview-face'

import type { Route } from './+types/new'

export async function loader({ request, context }: Route.LoaderArgs) {
  const rc = getRequestContext({ request, context })
  requireRole({ user: rc.viewer ?? undefined }, 'admin')
  return { preview: editorPreviewFace(rc.viewer!.role) }
}

export const meta = titleMeta('新建页面')

export default function WpAdminPageNewRoute({ loaderData }: Route.ComponentProps) {
  const navigate = useNavigate()
  return <PageEditorShell mode="create" navigate={navigate} preview={loaderData?.preview} />
}
