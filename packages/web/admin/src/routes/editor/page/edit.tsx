import { guardLoader } from '@kobato/web-admin/lib/guard-loader'
import { titleMeta } from '@kobato/web-admin/seo/title-meta'
import { PageEditorRoute } from '@kobato/web-admin/ui/pages/PageEditorRoute'
import { useNavigate } from 'react-router'

import type { Route } from './+types/edit'

export const clientLoader = guardLoader('admin')

export const meta = titleMeta('meta.title.editor.pageEdit')

export default function WpAdminPageEditRoute({ params }: Route.ComponentProps) {
  const navigate = useNavigate()
  return <PageEditorRoute pageId={params.id ?? ''} navigate={navigate} />
}
