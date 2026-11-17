import { guardOnlyLoader } from '@kobato/server/http/request-context.ts'
import { titleMeta } from '@kobato/shared/seo/title-meta.ts'
import { PageEditorRoute } from '@kobato/web/ui/admin/pages/PageEditorRoute.tsx'
import { useNavigate } from 'react-router'

import type { Route } from './+types/edit'

export const loader = guardOnlyLoader('admin')

export const meta = titleMeta('meta.title.editor.pageEdit')

export default function WpAdminPageEditRoute({ params }: Route.ComponentProps) {
  const navigate = useNavigate()
  return <PageEditorRoute pageId={params.id ?? ''} navigate={navigate} />
}
