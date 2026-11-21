import { guardOnlyLoader } from '@kobato/server/http/request-context'
import { PageEditorRoute } from '@kobato/web-admin/ui/pages/PageEditorRoute'
import { useNavigate } from 'react-router'

import { titleMeta } from '@/seo/title-meta'

import type { Route } from './+types/edit'

export const loader = guardOnlyLoader('admin')

export const meta = titleMeta('meta.title.editor.pageEdit')

export default function WpAdminPageEditRoute({ params }: Route.ComponentProps) {
  const navigate = useNavigate()
  return <PageEditorRoute pageId={params.id ?? ''} navigate={navigate} />
}
